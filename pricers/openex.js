// This file written for Kraken-Grid by Dave Scotese
// Feel free to use it as you please.
const got = require('got');
const prompt = require('prompt-sync')({sigint: true});
const Bot = require('../bot.js');
const url = 'https://openexchangerates.org/api/latest.json?app_id=';
async function OpenEx(base = 'ZUSD', cacheSeconds = 3600) {
    let latest = false,
        millisWait = 1000 * cacheSeconds;
        lastReq = 0;
    async function price(currency_symbol) {
        if(!latest || Date.now() - lastReq > millisWait) {
            const { body } = await got(url+app_id);
            latest = JSON.parse(body);
            lastReq = Date.now();
        }
        let USDPrice = 1/latest.rates[currency_symbol];
        return Number((base != 'ZUSD')
            ? latest.rates[base] * USDPrice
            : USDPrice);
    }
    return {price};
}
if(!Bot.extra.OpenEx_app_id) {
    Bot.s.save({OpenEx_app_id:prompt('Enter your OpenExchangeRates App ID:','N/A')});
}
const app_id = Bot.extra.OpenEx_app_id;
module.exports = function (Savings) {
    OpenEx().then(p => {
        Savings.setPricer(p,['XAU','XAG']);
    });
}
