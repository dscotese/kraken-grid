const test = require('ava');
const fs = require('fs');
const path = require('path');
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
const Allocation = require('../allocation.js');
let localDir, a, bot, man;

test.before('Load Allocation code...', t => {
    process.TESTING = 'cacheOnly';  // Do not use Kraken during testing.
    process.USECACHE = 'must';
    localDir = path.dirname(__filename);

    a = Allocation();
    a.addAsset('XBT',0.4);
    a.addAsset('XMR',0.4);
    global.kgPassword = "TestPW";
    // Initializes man, which initializes bot using kgPassword.
    const objInit = require("../init.js");
    bot = objInit.bot;
    man = objInit.man;
    // console.log('bot is ', bot);
});

test.serial('Overallocation prevention', all => {
    try {
        a.addAsset('DASH',0.3);
        let gotErr = false;
    } catch(err) {
        gotErr = true;
    }
    all.is(gotErr, true);
});

test.serial('Base Currency Tracking', all => {
    all.is(Math.round(10*a.get(0).target), 2);
});

test.serial('Update Allocation', all => {
    a.addAsset('XBT',0.5);
    all.is(Math.round(10*a.get(0).target), 1);
});

test.serial('setBase to EUR', all => {
    all.is(a.get(0).ticker,"ZUSD");
    a.setNumeraire('EUR');
    all.is(a.get(0).ticker,"EUR");
});

test.serial('Wait for the portfolio', async all => {
    //await man.init('abc123');
    await bot.report();
    all.log("bot.portfolio.Allocation.assets:\n", bot.portfolio.Allocation.assets);
    await bot.report();
    all.true(Object.keys(bot.portfolio).length > 6,
        'Portfolio has fewer than 6 properties.');
},10000);

const original_log = console.log;
let logged = '';

function captureLog(line, t) {
    if(console.log == original_log) {
        if(logged > '') console_log("How can logged be", logged,"?!??!");
        t.log("Start Capture at",line);
        console.log = (...args) => { 
            logged += '\n'+args.join(' ');
            //all.log("Captured ",logged);
        };
    } else {
        t.log("Captured",logged,"at",line);
        console.log = original_log;
        logged = '';
    }
}  

test.serial('Symbols, toggles, showPair...', async all => {
    // Try a bad symbol
    // ----------------
    await bot.report();
    let order_count = bot.portfolio['O'].length;
    console.log("Order count is",order_count,":",bot.portfolio['O']);
    captureLog("99 in test.js",all);
    await man.doCommands(['buy NSSXPDQ 0.01 1']);
    all.true(/NSSX/.test(logged));
    captureLog("Done at 102",all);
    all.true(bot.portfolio['O'].length == order_count);
//},10000);

    // Try a good symbol
    // -----------------
    await man.doCommands(['buy XBT 1 25']);    // I wish!
    // Install file with extra order:
    bot.tfc.useFile(path.join(localDir,'8open.json'));
    await bot.report();
    all.true(bot.portfolio['O'].length == 1+order_count);
    if(bot.portfolio['O'].length == 1+order_count) {
        bot.FLAGS.safe = false;
        await bot.kill(1,bot.portfolio['O']);
        bot.FLAGS.safe = true;
        bot.tfc.useFile(path.join(localDir,'7open.json'));
        await bot.report();
        all.true(bot.portfolio['O'].length == order_count,
            bot.portfolio['O'].length + ' != ' + order_count);
    }

    // Toggling risky
    // --------------
    let r0 = bot.showState().substr(-2,1);
    await man.doCommands(['risky','risky','risky']);
    all.true(bot.showState().substr(0,1) != r0,
        'Three calls failed to toggle risky');

    // Test that Safemode prevents orders over $25
    // -------------------------------------------
    await man.doCommands(['buy XBT 1 50']); // Fails because not safe.
    all.true(bot.portfolio['O'].length == order_count,
        bot.portfolio['O'].length + ' != ' + order_count);
    await bot.showPair('XREPZUSD');

    // Test that showPair returns a real pair
    // --------------------------------------
    let pair = bot.pairInfo('XREPZUSD');
    all.is(pair.quote,'ZUSD');
    all.is(pair.base,'XREP');
},60000);

test.serial('Dynamic Sell Amount Calculation', async t => {
    bot.tfc.useFile(path.join(localDir,'DACsCache.json'));  // Simulate no sells
    captureLog("Add a sell",t);
    await bot.report();
    t.true(/selling 0.023742124645772522 XBTUSD at 64674.5/.test(logged));
    captureLog("Sell tested.",t);
},10000);

test.serial('Dynamic Buy Amount Calculation', async t => {
    bot.tfc.useFile(path.join(localDir,'DACbCache.json'));  // Simulate no buys
    captureLog("Add a buy",t);
    await bot.report();
    t.true(/buying 0.6573442493668066 XBTUSD at 62777/.test(logged));
    captureLog("Buy tested.",t);
},10000);


