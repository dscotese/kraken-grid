/* eslint-disable import/extensions */
/* eslint-disable no-param-reassign */
import got from 'got';
import crypto from 'crypto';
import WebSocket from 'ws';
import TFC from './testFasterCache.js';

// Public/Private method names
const endpoints = {
    public  : [ 'symbols', 'symbols/details', 'network', 'pubticker', 'v2/ticker',
        'candles', 'derivatives', 'feepromos', 'book', 'trades', 'pricefeed',
        'fundingamount', 'farxlsx', 'fprxlsx', 'fxrate', 'riskstats', 'marketdata' ],
    private : [ 'order/new', 'order/cancel', 'wrap', 'session', 'all', 
        'order/events', 'marketdata',
        'order/status', 'orders', 'mytrades', 'orders/history', 'notionalvolume',
        'tradevolume', 'positions', 'balances', 'margin', 'fundingpayment' ]
};

// Create a signature for a request
const getMessageSignature = (message, secret, nonce) => {
console.log('message, secret, nonce:',message, secret, nonce);
    // const req_buffer    = Buffer.from(message).toString('base64');
    // const hash          = new crypto.createHash('sha256');
    // eslint-disable-next-line new-cap
    const hmac          = new crypto.createHmac('sha384', secret);
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
export default function GeminiClient (key, secret, options = {}) {
    // Default options
    const defaults = {
        url      : process.TESTING ? 'https://api.sandbox.gemini.com/' 
                                : 'https://api.gemini.com/',
        version : 'v1',
        timeout  : process.TESTING ? 60000 : 5000,
    };

    const config = {key, secret, ...defaults, ...options};
    console.log("config:",config);

    const k2gtfc = TFC(process.TESTING,"Gem");

    const maxConcurrent = 10;
    let conCurrent = 0;
    
    // Create a queue of resolve functions
    const waiters = [];
    
    function waitForSlot() {
        if (conCurrent < maxConcurrent) {
            conCurrent += 1;
            return Promise.resolve();
        }
        
        return new Promise(resolve => {
            waiters.push(() => {
                conCurrent += 1;
                resolve()
            });
        });
    }
    
    function releaseSlot() {
        conCurrent -= 1;
        // If we've dropped below max, wake up a waiter
        if (conCurrent < maxConcurrent && waiters.length > 0) {
            const resolve = waiters.shift();
            resolve();
        }
    }
    
    // Send an API request
    async function rawRequest(method, path, headers, timeout) {
        await waitForSlot();
        const isWS = /(events$|marketdata)/.test(path);

        headers['User-Agent'] = isWS
            ? 'Gemini Javascript API Client'
            : 'Node.js WebSocket Client';

        const defopts = { headers, timeout:{
            lookup: process.TESTING ? 30000 : 500,
            connect: process.TESTING ? 30000 : 500,
            secureConnect: process.TESTING ? 30000 : 500,
            socket: process.TESTING ? 30000 : 1000,
            send: process.TESTING ? 30000 : 2000,
        } };
        defopts.timeout.response = timeout;

        Object.assign(options, defopts);

        Object.assign(options, { method });
        if(method === 'POST') options.body = '';
        else delete options.body;

console.log(`config.url(59):${config.url}, conCurrent:${conCurrent}`);
        const url  = (isWS ? config.url.replace('https','wss') : config.url) + path;
        try {
            if(isWS) {
                return new WebSocket(url, headers);
            }
            return await got(url, options).json();
        } catch(e) {
            console.log(`${url} failed because ${e}\n
                headers:${Object.entries(headers)}`);
        } finally {
            console.log('rawRequest: in finally block, about to release slot');
            releaseSlot();
        }
        return {};
    }

    /**
     * This method makes a public API request.
     * @param  {String}   method   The API method (public or private)
     * @param  {Object}   params   Arguments to pass to the api call
     * @param  {Function} callback A callback function to be executed when the request is complete
     * @return {Object}            The request object
     */
    function publicMethod(method, params) {
        params = params || [];

        // Add parameters to APIs that need them.
        // --------------------------------------
        if(!['symbols','network','feepromos','pricefeed']
            .includes(method) && Object.values(params).length !== 1)
            throw new Error(`${method } requires a parameter.`);

        if(/^marketdata/.test(method))
            throw new Error(`MarketData Websockt not yet supported.`);
        
        Object.values(params).forEach(v => {method += `/${v}`});

        const path     = /^v\d\//.test(method) // In case we use the new version.
            ? `${method}`
            : `${config.version  }/${  method}`;
        return [path, []];
    }

    /**
     * This method makes a private API request.
     * @param  {String}   method   The API method (public or private)
     * @param  {Object}   params   Arguments to pass to the api call
     * @param  {Function} callback A callback function to be executed when the request is complete
     * @return {Object}            The request object
     */
    function privateMethod(method, params) {
        params = params || {};

        // Default params to empty object
        if(typeof params === 'function') {
            params   = {};
        }

        const path = `${config.version  }/${  method}`;

        // Remove nonce later if we add it now.
        let newNonce = false;

        if(!params.nonce) {
            params.nonce = Math.floor(new Date()/1000);
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
        console.log("reqStr,payload: ",reqStr,payload);
            const signature = getMessageSignature(
                payload,
                config.secret,
                params.nonce
            );

        const headers = {
            'X-GEMINI-PAYLOAD'   : payload,
            'X-GEMINI-APIKEY'    : config.key,
            'X-GEMINI-SIGNATURE' : signature,
        };
        if(/(events$|marketdata)/.test(path)) {
            console.log(headers);
        }

        // const response = this.rawRequest('POST', headers, params, config.timeout);

        if(newNonce) {
            delete params.nonce;
        }
        return [path, headers];
    }

    /**
     * This method makes a public or private API request.
     * @param  {String}   method   The API method (public or private)
     * @param  {Object}   params   Arguments to pass to the api call
     * @param  {Function} callback A callback function to be executed when the request is complete
     * @return {Object}            The request object
     */
    async function api(endpoint, params, callback) {
        // Default params to empty object
        if(typeof params === 'function') {
            callback = params;
            params   = {};
        }
        let reqType; 
        let path; 
        let headers;
        const objCache = k2gtfc.isCached("gemini.api",[endpoint,params]);

        if(endpoints.public.includes(endpoint)) {
            [path, headers] = publicMethod(endpoint, params);
            reqType = "GET";
        }
        else if(endpoints.private.includes(endpoint)) {
            [path, headers] = privateMethod(endpoint, params);
            reqType = "POST";
        }
        else {
            throw new Error(`${endpoint  } is not (yet?) a supported API endpoint.`);
        }
        
        let response;
        if(objCache.answer === false) {
            response = await rawRequest(reqType, path, headers, config.timeout);
            k2gtfc.store(objCache.id,response);
        } else response = objCache.cached;
        
        if(typeof callback === 'function') {
            response
                .then((result) => callback(null, result))
                .catch((error) => callback(error, null));
        }

        return response;
    }

    return {api};
}