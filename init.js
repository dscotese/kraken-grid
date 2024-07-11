#!/usr/bin/env node
process.TESTING = process.TESTING || !(/init.js$|kraken-grid$/.test(process.argv[1]));
console.log("filename is ",process.argv[1]);
const Manager = require('./manager.js');
const Bot = require('./bot.js');
const Web = require('./web.js');
let bot = Bot();
let man = Manager(bot);
//let web = Web(manager);
if(!process.TESTING) man.init();
// else  manager.init();
// For testing purposes, we provide these two items
// They will not be ready for use until manager.init is done,
// which is why we leave the tester to call it.
module.exports = {man, bot};
