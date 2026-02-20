/* eslint-disable promise/prefer-await-to-then */
/* eslint-disable promise/prefer-await-to-callbacks */
/* eslint-disable import/extensions */
/* eslint-disable no-param-reassign */
import got, { OptionsInit, Response as GotResponse } from 'got';
import crypto from 'crypto';
import WebSocket from 'ws';
import TFC from './testFasterCache.js';

// Define interfaces for parameters and responses
interface GeminiOptions {
  url?: string;
  version?: string;
  timeout?: number;
  [key: string]: any;
}

interface GeminiRequestHeaders {
  'X-GEMINI-PAYLOAD'?: string;
  'X-GEMINI-APIKEY'?: string;
  'X-GEMINI-SIGNATURE'?: string;
  'User-Agent'?: string;
  [key: string]: any;
}

interface GeminiRequestOptions {
  headers: GeminiRequestHeaders;
  timeout: {
    lookup: number;
    connect: number;
    secureConnect: number;
    socket: number;
    send: number;
    response: number;
  };
  method?: string;
  body?: string;
  [key: string]: any;
}

interface TaskCacheEntry {
  promise: Promise<any>;
  callbacks: ((error: any, result: any) => void)[];
}

interface CachedApiFunction {
  (endpoint: string, args: any, callback?: (error: any, result: any) => void): Promise<any>;
  taskCache?: Map<string, TaskCacheEntry>;
}

// Public/Private method names
const endpoints = {
    public  : [ 'symbols', 'symbols/details', 'network', 'pubticker', 'v2/ticker',
        'v2/candles', 'derivatives', 'feepromos', 'book', 'trades', 'pricefeed',
        'fundingamount', 'farxlsx', 'fprxlsx', 'fxrate', 'riskstats', 'marketdata' ],
    private : [ 'order/new', 'order/cancel', 'wrap', 'session', 'all', 
        'order/events', 'marketdata',
        'order/status', 'orders', 'mytrades', 'orders/history', 'notionalvolume',
        'tradevolume', 'positions', 'balances', 'margin', 'fundingpayment' ]
};

// Create a signature for a request
const getMessageSignature = (message: string, secret: string, nonce: number): string => {
    console.log('message, secret, nonce:', message, secret, nonce);
    // const req_buffer    = Buffer.from(message).toString('base64');
    // const hash          = new crypto.createHash('sha256');
    // eslint-disable-next-line new-cap
    const hmac = crypto.createHmac('sha384', secret);
    // const hash_digest   = hash.update(nonce + message).digest('binary');
    return hmac.update(message, 'utf8').digest('hex');
};

/**
 * This connects to Gemini.com's API.
 * @param {String}        key               API Key
 * @param {String}        secret            API Secret
 * @param {String|Object} [options={}]      Additional options. If a string is passed, will default to just setting `options.otp`.
 * @param {String}        [options.otp]     Two-factor password (optional) (also, doesn't work)
 * @param {Number}        [options.timeout] Maximum timeout (in milliseconds) for all API-calls (passed to `request`)
 */
export default function GeminiClient(key: string, secret: string, options: GeminiOptions = {}) {
    // Default options
    const defaults = {
        url      : process.TESTING ? 'https://api.sandbox.gemini.com/' 
                                : 'https://api.gemini.com/',
        version : 'v1',
        timeout  : process.TESTING ? 60000 : 5000,
    };

    const config = {key, secret, ...defaults, ...options};
    console.log("config:", config);

    const k2gtfc = TFC(process.TESTING, "Gem");

    const maxConcurrent = 10;
    let conCurrent = 0;
    
    // Create a queue of resolve functions
    const waiters: (() => void)[] = [];
    
    function waitForSlot(): Promise<void> {
        if (conCurrent < maxConcurrent) {
            conCurrent += 1;
            return Promise.resolve();
        }
        
        return new Promise(resolve => {
            waiters.push(() => {
                conCurrent += 1;
                resolve();
            });
        });
    }
    
    function releaseSlot(): void {
        conCurrent -= 1;
        // If we've dropped below max, wake up a waiter
        if (conCurrent < maxConcurrent && waiters.length > 0) {
            const resolve = waiters.shift();
            if (resolve) resolve();
        }
    }

    // Send an API request
    async function protectedRequest(
        method: string, 
        path: string, 
        headers: GeminiRequestHeaders, 
        timeout: number
    ): Promise<any> {
        const isWS = /(events$|marketdata)/.test(path);

        headers['User-Agent'] = !isWS
            ? 'Gemini Javascript API Client'
            : 'Node.js WebSocket Client';

        const defopts: GeminiRequestOptions = { 
            headers, 
            timeout: {
                lookup: process.TESTING ? 30000 : 5000,
                connect: process.TESTING ? 30000 : 5000,
                secureConnect: process.TESTING ? 30000 : 5000,
                socket: process.TESTING ? 30000 : 5000,
                send: process.TESTING ? 30000 : 2000,
                response: timeout
            } 
        };

        // Create a local copy that won't confuse TypeScript with the parameter
        const requestOpts: OptionsInit = { ...options } as OptionsInit;
        Object.assign(requestOpts, defopts);
        Object.assign(requestOpts, { method });

        if (method === 'POST') requestOpts.body = '';
        else delete requestOpts.body;

        const url = (isWS ? config.url.replace('https', 'wss') : config.url) + path;
        console.log(`path:${url}, conCurrent:${conCurrent}`);
        let retries = 3;
        
        // eslint-disable-next-line no-plusplus
        while(--retries > 0) {
            await waitForSlot();
            try {
                if(isWS) {
                    return new WebSocket(url, headers);
                }
                // eslint-disable-next-line no-await-in-loop
                const response = await got(url, requestOpts) as GotResponse;
                // eslint-disable-next-line no-await-in-loop
                const ret = await JSON.parse(response.rawBody.toString());
                return ret;
            } catch(e) {
                console.log(`${url} failed because ${e
                }\n headers:${Object.entries(headers)
                }, will try ${retries} more time(s).`);
                if(retries === 0) throw e;
            } finally {
                releaseSlot();
            }
        }
        throw new Error(`Failed three tries for ${url}`);
    }
    
    interface Mutex {
        locked: boolean;
        queue: (() => void)[];
        lock(): Promise<void>;
        unlock(): void;
    }
    
    const mutex: Mutex = {
        locked: false,
        queue: [],
        lock: async function lock() {
            if (this.locked) {
                // eslint-disable-next-line no-promise-executor-return
                await new Promise<void>(resolve => this.queue.push(resolve));
            }
            this.locked = true;
        },
        unlock: function unlock() {
            this.locked = false;
            const next = this.queue.shift();
            if (next) next();
        }
    };
    
    async function rawRequest(
        method: string, 
        path: string, 
        headers: GeminiRequestHeaders, 
        timeout: number
    ): Promise<any> {
        await mutex.lock();
        try {
            return await protectedRequest(method, path, headers, timeout);
        } finally {
            mutex.unlock();
        }
    }

    /**
     * This method makes a public API request.
     * @param  {String}   method   The API method (public or private)
     * @param  {Object}   params   Arguments to pass to the api call
     * @return {Array}             Path and headers array
     */
    function publicMethod(method: string, params: any = []): [string, GeminiRequestHeaders] {
        // Add parameters to APIs that need them.
        // --------------------------------------
        if(!['symbols', 'network', 'feepromos', 'pricefeed']
            .includes(method) && Object.values(params).length < 1)
            throw new Error(`${method} requires a parameter.`);

        if(/^marketdata/.test(method))
            throw new Error(`MarketData Websockt not yet supported.`);
        
        const qs: string[] = [];
        Object.entries(params).forEach(([n, v]) => {
            if(/limit_...s/.test(n)) qs.push(`${n}=${v}`);
            else method += `/${v}`;
        });
        
        if(qs.length > 0) method += `?${qs.join('&')}`;

        const path = /^v\d\//.test(method) // In case we use the new version.
            ? `${method}`
            : `${config.version}/${method}`;
            
        return [path, {}];
    }

    /**
     * This method makes a private API request.
     * @param  {String}   method   The API method (public or private)
     * @param  {Object}   params   Arguments to pass to the api call
     * @return {Array}             Path and headers array
     */
    function privateMethod(
        method: string, 
        params: Record<string, any> = {}
    ): [string, GeminiRequestHeaders] {
        // Default params to empty object
        if(typeof params === 'function') {
            params = {};
        }

        const path = `${config.version}/${method}`;

        // Remove nonce later if we add it now.
        let newNonce = false;

        if(!params.nonce) {
            params.nonce = Math.floor(new Date().getTime() / 1000);
            if(params.ctr) {
                params.nonce += params.ctr;
                delete params.ctr;
            }
            newNonce = true;
        }

        if(!params.request) {
            params.request = `/${path}`;
        }

        const reqStr = JSON.stringify(params);

        const payload = Buffer.from(reqStr).toString('base64');
        console.log("reqStr,payload: ", reqStr, payload);
        
        const signature = getMessageSignature(
            payload,
            config.secret,
            params.nonce
        );

        const headers: GeminiRequestHeaders = {
            'X-GEMINI-PAYLOAD'   : payload,
            'X-GEMINI-APIKEY'    : config.key,
            'X-GEMINI-SIGNATURE' : signature,
        };
        
        if(/(events$|marketdata)/.test(path)) {
            console.log(headers);
        }

        if(newNonce) {
            delete params.nonce;
        }
        
        return [path, headers];
    }

    /**
     * This method makes a public or private API request.
     * @param  {String}   endpoint  The API endpoint (public or private)
     * @param  {Object}   params     Arguments to pass to the api call
     * @param  {Function} callback   A callback function to be executed when the request is complete
     * @return {Object}              The request object
     */
    async function api(
        endpoint: string, 
        params: any = {}, 
        callback?: (error: any, result: any) => void
    ): Promise<any> {
        // Default params to empty object
        if(typeof params === 'function') {
            callback = params as (error: any, result: any) => void;
            params = {};
        }
        
        let reqType: string; 
        let path: string; 
        let headers: GeminiRequestHeaders;
        const objCache = k2gtfc.isCached("gemini.api", [endpoint, params]);

        if(endpoints.public.includes(endpoint)) {
            [path, headers] = publicMethod(endpoint, params);
            reqType = "GET";
        }
        else if(endpoints.private.includes(endpoint)) {
            [path, headers] = privateMethod(endpoint, params);
            reqType = "POST";
        }
        else {
            throw new Error(`${endpoint} is not (yet?) a supported API endpoint.`);
        }
        
        let response;
        if(objCache.answer === false || !process.USECACHE) {
            response = await rawRequest(reqType, path, headers, config.timeout as number);
            k2gtfc.store(objCache.id, response);
        } else {
            response = objCache.cached;
        }
        
        if(typeof callback === 'function' && response.then) {
            response
                .then((result: any) => callback(null, result))
                .catch((error: any) => callback(error, null));
        }

        return response;
    }

    /**
     * This method will cache the answer and return the same promise
     * for any more calls for the same thing for 100ms after the promise
     * resolves.
     */
    const cachedApi: CachedApiFunction = (
        endpoint: string, 
        args: any = {}, 
        callback?: (error: any, result: any) => void
    ): Promise<any> => {
        if (!cachedApi.taskCache) {
            cachedApi.taskCache = new Map<string, TaskCacheEntry>();
        }
        
        const cKey = `${endpoint}:${JSON.stringify(args)}`;
    
        if (cachedApi.taskCache.has(cKey)) {
            const task = cachedApi.taskCache.get(cKey)!;
            if (typeof callback === 'function') task.callbacks.push(callback);
            return task.promise;
        }
    
        const callbacks = callback ? [callback] : [];
        const promise = api(endpoint, args, (error: any, result: any) => {
            callbacks.forEach(cb => cb(error, result));
        }).finally(() => {
            setTimeout(() => {
                if (cachedApi.taskCache) {
                    cachedApi.taskCache.delete(cKey);
                }
            }, 100);
        });
    
        cachedApi.taskCache.set(cKey, { promise, callbacks });
        return promise;
    };

    return { api, cachedApi };
}