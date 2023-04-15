const test = require('ava');
/* Uncomment this to eliminate ava...
function test(title, fn) {
    console.log("Running ",title);
    tester = {};
    tester.is = ()=>{};
    tester.pass = ()=>{};
    return fn(tester);
}
*/
test('foo', t => {
    t.pass();
});

test('bar', async t => {
    const bar = Promise.resolve('bar');
    t.is(await bar, 'bar');
});

a = require("../allocation.js")();
a.addAsset('XBT',0.4);
a.addAsset('XMR',0.4);

test('Overallocation prevention', all => {
    try {
        a.addAsset('DASH',0.3);
        let gotErr = false;
    } catch(err) {
        gotErr = true;
    }
    all.is(gotErr, true);
});

test('Base Currency Tracking', all => {
    all.is(Math.round(10*a.get(0).target), 2);
});

test('Update Allocation', all => {
    a.addAsset('XBT',0.5);
    all.is(Math.round(10*a.get(0).target), 1);
});

test('setBase to EUR', all => {
    all.is(a.get(0).ticker,"ZUSD");
    a.setNumeraire('EUR');
    all.is(a.get(0).ticker,"EUR");
});

const objInit = require("../init.js");
let bot = objInit.bot;
const man = objInit.man;

// console.log('bot is ', bot);
test.serial('Wait for the portfolio', async all => {
    await man.init('abc123');
    console.log("bot.portfolio keys:\n", Object.keys(bot.portfolio));
    await bot.report();
    all.true(Object.keys(bot.portfolio).length > 6,
        'Portfolio has fewer than 6 properties.');

    // Try a bad symbol
    // ----------------
    let order_count = bot.portfolio['O'].length; 
    await all.throwsAsync(async () => {await man.doCommands(['buy NSSXPDQ 0.01 1'])},
        {message: /NSSX/});
    await bot.report();
    all.true(bot.portfolio['O'].length == order_count);

    // Try a good symbol
    // -----------------
    await man.doCommands(['buy XBT 1 25']);    // I wish!
    await bot.report();
    all.true(bot.portfolio['O'].length == 1+order_count);
    if(bot.portfolio['O'].length == 1+order_count) {
        bot.FLAGS.safe = false;
        await bot.kill(1,bot.portfolio['O']);
        bot.FLAGS.safe = true;
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
});

/* The answer is YES ...
test.only('Does manager get a dynamic copy of portfolio?', async all => {
    await bot.init();
    await bot.report();
    bot.showortBTC(); man.showortBTC();
    bot.BTC20();
    bot.showortBTC(); man.showortBTC();
}); 

  The answer is YES again!
test.only('Can manager change elements of portfolio?', async all => {
    await bot.init();
    await bot.report();
    bot.showortBTC(); man.showortBTC();
    man.BTC20();
    bot.showortBTC(); man.showortBTC();
});
*/



/*
Balancer = require("../balancer.js");

    b = new Balancer(a,[],0);
    b.setTrades(0.05);
*/

