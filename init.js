#!/usr/bin/env node
/* eslint-disable import/extensions */
/*
const yargs = require('yargs');
const argv = yargs
    .option('testing', {
        alias: 't',
        default: "",
        describe: "value for global.TESTING",
        type: 'string'
    })
    .option('cacheOnly', {
        alias: 'co',
        default: false,
        describe: "Avoid the Internet by using cached.json.",
        type: 'boolean'
    })
    .help('h')
    .alias('h', 'help')
    .argv;
*/        
import Manager from './manager.js';
import { Bot } from './bot.js';
import { AllocCon } from './allocation.js';
import Savings from './savings.js';
import Balancer from './balancer.js';
import Web from './web.js';

process.TESTING = process.TESTING || !(/init.js$|kraken-grid$/.test(process.argv[1]));
if(process.argv.length > 2) [,,process.TESTING] = process.argv;
if((typeof process.TESTING)==='string' 
    && process.TESTING.toLowerCase() === 'cacheonly') {
    if( process.argv.length > 3 ) [,,,process.TESTING] = process.argv;
    process.USECACHE = 'must';
}
// eslint-disable-next-line no-console
console.log(`filename is ${process.argv[1]} in ${process.TESTING
    ? `test(${process.TESTING})`
    : 'production'} mode.`);
const allConfig = {AllocCon, Savings, Balancer, Web};
// The three following constructors assign their return
// values to allConfig.[man, bot, web].
Bot(allConfig);
Manager(allConfig);
if( process.TESTING ) global.kgPassword = "TestPW";
allConfig.man.init(global.kgPassword);
export default allConfig;