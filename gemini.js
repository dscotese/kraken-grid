/* eslint-disable import/extensions */
/* eslint-disable no-param-reassign */
import got from 'got';
import crypto from 'crypto';
import qs from 'qs';
import TFC from './testFasterCache.js';

const k2gtfc = TFC(process.TESTING,"Gem");

// Public/Private method names
const endpoints = {
    public  : [ 'symbols', 'symbols/details', 'network', 'pubticker', 'ticker',
        'candles', 'derivatives', 'feepromos', 'book', 'trades', 'pricefeed',
        'fundingamount', 'farxlsx', 'fprxlsx', 'fxrate', 'riskstats' ],
    private : [ 'new', 'cancel', 'wrap', 'session', 'all', 'order/status', 'orders',
        'mytrades', 'history', 'notionalvolume', 'tradevolume', 'positions',
        'balances', 'margin', 'fundingpayment' ]
};

// Default options
const defaults = {
    url      : process.TESTING ? 'https://api.sandbox.gemini.com/' : 'https://api.sandbox.gemini.com/',
    version : 'v1',
    timeout  : process.TESTING ? 60000 : 5000,
};

// Create a signature for a request
const getMessageSignature = (message, secret, nonce) => {
console.log('message, secret, nonce:',message, secret, nonce);
    // const req_buffer    = Buffer.from(message).toString('base64');
    // const hash          = new crypto.createHash('sha256');
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
    const config = {key, secret, ...defaults, ...options};
    console.log("config:",config);

    // Send an API request
    const maxConcurrent = 10;
    let conCurrent = 0;
    
    // Create a queue of resolve functions
    const waiters = [];
    
    function waitForSlot() {
        if (conCurrent < maxConcurrent) {
            conCurrent++;
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
    
    async function rawRequest(method, path, headers, timeout) {
        await waitForSlot();

        headers['User-Agent'] = 'Gemini Javascript API Client';

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
        const url  = config.url + path;
        try {
            return await got(url, options).json();
        } catch(e) {
            console.log(`${url} failed because ${e}`);
        } finally {
            console.log('rawRequest: in finally block, about to release slot');
            releaseSlot();
        }
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
        if(!['symbols','network','feepromos','pricefeed'].includes(method)
            && params.length !== 1) throw new Error(
                `${method } requires a parameter.`);
        let p;
        for(p in params) method += `/${  params[p]}`;

        const path     = `${config.version  }/${  method}`;
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

        if(config.otp !== undefined) {
            params.otp = config.otp;
        }

        if(!params.request) {
            params.request = `/${path}`;
        }
/* Prove it works using code from https://docs.gemini.com/rest-api/#private-api-invocation:

params = {
    "request": "/v1/order/status",
    "nonce": 123456,
    "order_id": 18834
}
config = {secret:'1234abcd', key:'mykey'};
*/
const reqStr = JSON.stringify(params);
/*
'{\n'+
'    "request": "/v1/order/status",\n'+
'    "nonce": 123456,\n'+
'\n'+
'    "order_id": 18834\n'+
'}\n';
*/
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