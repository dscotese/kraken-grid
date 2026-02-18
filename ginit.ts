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

// Module-level reference to manager for error handlers
let managerInstance: any = null;

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.error('Stack trace:', (reason as Error)?.stack || 'No stack trace available');
    
    // Stop automatic execution if manager exists
    if (managerInstance) {
        try {
            managerInstance.setAuto(undefined);
            console.log('Automatic execution stopped due to error');
        } catch (e) {
            console.error('Failed to stop automatic execution:', e);
        }
    }
    
    // In production, you might want to exit: process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.error('Stack trace:', error.stack);
    
    // Stop automatic execution if manager exists
    if (managerInstance) {
        try {
            managerInstance.setAuto(undefined);
            console.log('Automatic execution stopped due to critical error');
        } catch (e) {
            console.error('Failed to stop automatic execution:', e);
        }
    }
    
    // Critical error - exit after logging
    process.exit(1);
});

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
    // SET the module-level reference
    managerInstance = allConfig.man;
    if( process.TESTING ) global.kgPassword = "TestPWG";
    if(initMan) {
        await allConfig.man.init(global.kgPassword);
        allConfig.gemWS = await GemSock(allConfig as any);
    }
    return allConfig;
}

if (/ginit.js$|kraken-grid$/.test(process.argv[1])) init();