#!/usr/bin/env node
/* eslint-disable import/extensions */
import Manager from './manager.js';
import { Bot } from './bot.js';
import { AllocCon } from './allocation.js';
import Savings from './savings.js';
import Balancer from './balancer.js';
import Web from './web.js';
import ClientCon from './krak2gem.js';

export default async function init(initMan = true) {
    process.TESTING = process.TESTING || !(/ginit.js$|gemini-grid$/.test(process.argv[1]));
    if(process.argv.length > 2) [,,process.TESTING] = process.argv;
    console.log(`filename is ${process.argv[1]} in ${process.TESTING
        ? `test(${process.TESTING})`
        : 'production'} mode.`);
    const allConfig = {AllocCon, Savings, Balancer, Web, ClientCon};
    // The three following constructors assign their return
    // values to allConfig.[man, bot, web].
    Bot(allConfig);
    Manager(allConfig);
    if( process.TESTING ) global.kgPassword = "TestPWG";
    if(initMan) allConfig.man.init(global.kgPassword);
    return allConfig;
}

if (/ginit.js$|kraken-grid$/.test(process.argv[1])) init();