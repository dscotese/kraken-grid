/* eslintx-disable import/extensions */
/* eslint-disable no-console */
import {expect, describe, test, jest} from '@jest/globals';
import path from 'path';
/* Uncomment this to eliminate ava...
function test(title, fn) {
    console.log("Running ",title);
    tester = {};
    tester.is = ()=>{};
    tester.pass = ()=>{};
    return fn(tester);
}


test('foo', t => {
    t.pass();
    t.log("Baseline Ava test written to pass.");
});

test('bar', async t => {
    const bar = Promise.resolve('bar');
    t.is(await bar, 'bar');
});
*/
import { AllocCon } from '../allocation';
// TestPW is a special password that blocks encryption so that
// the file storing API keys and other sensitive data can be
// altered as necessary for tests. By setting global.kgPassword,
// we bypass the call to prompt so no user input is required.
global.kgPassword = "TestPW"; // Also set in init just in case.
// Initializes man, which initializes bot using kgPassword.
// eslint-disable-next-line import/first
import objInit from "../init";

process.TESTING = 'cacheOnly';  // Do not use Kraken during testing.
process.USECACHE = 'must';
const localDir = process.cwd();
let a; 
let bot; 
let man;

beforeAll(() => {

    bot = objInit.bot;
    man = objInit.man;
    // Not testing the command ine interface (yet?)
    man.ignore();
    a = AllocCon({bot, Savings:null});
    a.addAsset('XBT',0.4);
    a.addAsset('XMR',0.4);
    bot.tfc.useFile(path.join(localDir,'test',"7open.json"));
    // console.log('bot is ', bot);
});

test('Overallocation prevention', () => {
    let gotErr = false;
    try {
        a.addAsset('DASH',0.3);
    } catch(err) {
        gotErr = true;
    }
    expect(gotErr).toBe(true);
});

test('Base Currency Tracking', () => {
    expect(Math.round(10*a.get(0).target)).toBe(2);
});

test('Update Allocation', () => {
    a.addAsset('XBT',0.5);
    expect(Math.round(10*a.get(0).target)).toBe(1);
});

test('setBase to EUR', () => {
    expect(a.get(0).ticker).toBe("ZUSD");
    a.setNumeraire('EUR');
    expect(a.get(0).ticker).toBe("EUR");
});

test('Wait for the portfolio', async () => {
    await bot.report();
    console.log("bot.getPortfolio().Allocation.assets:\n", 
        bot.getPortfolio().Allocation.assets);
    expect(Object.keys(bot.getPortfolio()).length > 6).toBeTruthy();
},10000);


/*
function captureLog(line) {
    if(console.log === console.log) {
        if(logged > '') console.log("How can logged be", logged,"?!??!");
        console.log("Start Capture at",line);
        console.log = (...args) => { 
            logged += `\n${args.join(' ')}`;
            // all.log("Captured ",logged);
        };
    } else {
        console.log("Captured",logged,"at",line);
        console.log = console.log;
        logged = '';
    }
}  
*/
test('Symbols, toggles, showPair...', async () => {
    // Try a bad symbol
    // ----------------
    await bot.report();
    const orderCount = bot.getPortfolio().O.length;
    console.log("Order count is",orderCount,":",bot.getPortfolio().O);
    const consoleSpy = jest.spyOn(console, 'log');
    //    captureLog("99 in test.js",all);
    await man.doCommands(['buy NSSXPDQ 0.01 1']);
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("not a recognized"));
//    captureLog("Done at 102",all);
    expect(bot.getPortfolio().O.length === orderCount).toBeTruthy();
    consoleSpy.mockRestore();
// },10000);

    // Try a good symbol
    // -----------------
    await man.doCommands(['buy XBT 1 25']);    // I wish!
    // Install file with extra order:
    bot.tfc.useFile(path.join(localDir,'test','8open.json'));
//    captureLog("Reporting 8open...", all);
    await bot.report();
//    captureLog("8open done.", all);
    console.log("Order count is",orderCount,":",bot.getPortfolio().O);
    expect(bot.getPortfolio().O.length === 1+orderCount).toBeTruthy();
    if(bot.getPortfolio().O.length === 1+orderCount) {
        bot.FLAGS.safe = false;
        await bot.kill(1,bot.getPortfolio().O);
        bot.FLAGS.safe = true;
        bot.tfc.useFile(path.join(localDir,'test','7open.json'));
        await bot.report();
        expect(bot.getPortfolio().O.length === orderCount).toBeTruthy();
    }

    // Toggling risky
    // --------------
    const r0 = bot.showState().substr(-2,1);
    await man.doCommands(['risky','risky','risky']);
    expect(bot.showState().substr(0,1) !== r0).toBeTruthy();

    // Test that Safemode prevents orders over $25
    // -------------------------------------------
    await man.doCommands(['buy XBT 1 50']); // Fails because not safe.
    expect(bot.getPortfolio().O.length === orderCount).toBeTruthy();
    bot.showPair('XREPZUSD');        
    // Test that showPair returns a real pair
    // --------------------------------------
    const pair = bot.pairInfo('XREPZUSD');
    expect(pair.quote === 'ZUSD').toBeTruthy();
    expect(pair.base === 'XREP').toBeTruthy();
},10000);

test('Dynamic Sell Amount Calculation', async () => {
    bot.tfc.useFile(path.join(localDir,'test','DACsCache.json'));  // Simulate no sells
//    captureLog("Add a sell",console);
    const consoleSpy = jest.spyOn(console, 'log');
    await bot.report();
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/selling 0.023742124645772522 XBTUSD at 64674.5/));
    consoleSpy.mockRestore();
//    captureLog("Sell tested.",console);
},10000);

test('Dynamic Buy Amount Calculation', async () => {
    bot.tfc.useFile(path.join(localDir,'test','DACbCache.json'));  // Simulate no buys
//    captureLog("Add a buy",console);
    const consoleSpy = jest.spyOn(console, 'log');
    await bot.report();
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/buying 0.6573442493668066 XBTUSD at 62777/));
    consoleSpy.mockRestore();

        //    captureLog("Buy tested.",console);
},10000);

/*
test('Quitting...', async() => {
    await man.doCommands(['quit']);
    expect(man.doCommands('')).toThrow();
}, 1000);
*/
