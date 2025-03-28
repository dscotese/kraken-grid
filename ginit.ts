#!/usr/bin/env node
/* eslint-disable import/extensions */
import ClientCon from './krak2gem.js';
import Manager from './manager.js';
import Bot from './bot.js';
import { AllocCon } from './allocation.js';
import Savings from './savings.js';
import Balancer from './balancer.js';
import Web from './web.js';
import GemSock from './websocket.js';

process.on('unhandledRejection', (e) => { debugger });

export {}
export default async function init(initMan = true) {
    process.TESTING = process.TESTING || !(/ginit.js$|gemini-grid$/.test(process.argv[1]));
    if(process.argv.length > 2) [,,process.TESTING] = process.argv;
    switch(typeof process.TESTING) { 
        case 'string': if(process.TESTING.toLowerCase() === 'cacheonly') {
            if( process.argv.length > 3 ) [,,,process.TESTING] = process.argv;
            process.USECACHE = 'G';
        }
    }
    console.log(`filename is ${process.argv[1]} in ${process.TESTING
        ? `test(${process.TESTING})`
        : 'production'} mode.`);
    const allConfig: { [key: string]: any } = 
        {AllocCon, Savings, Balancer, Web, ClientCon};
    // The three following constructors assign their return
    // values to allConfig.[man, bot, web].
    Bot(allConfig);
    Manager(allConfig);
    if( process.TESTING ) global.kgPassword = "TestPWG";
    if(initMan) await allConfig.man.init(global.kgPassword);
    // allConfig.gemWS = GemSock(allConfig);
    return allConfig;
}

if (/ginit.js$|kraken-grid$/.test(process.argv[1])) init();