/* eslintx-disable import/extensions */
/* eslint-disable no-console */
import {expect, describe, test, jest} from '@jest/globals';
import path from 'path';
import http from 'http';
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
// TestPW is a special password that blocks encryption so that
// the file storing API keys and other sensitive data can be
// altered as necessary for tests. By setting global.kgPassword,
// we bypass the call to prompt so no user input is required.
global.kgPassword = "TestPW"; // Also set in init just in case.
// Initializes man, which initializes bot using kgPassword.
// eslint-disable-next-line import/first
import fnInit from "../init";

process.TESTING = 'cacheOnly';  // Do not use Kraken during testing.
process.USECACHE = 'must';
const localDir = process.cwd();
let a; 
let bot; 
let man;
let AllocCon;

beforeAll(async () => {

    const allConfig = await fnInit();
    ({bot, man, AllocCon} = allConfig);
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

test('Closed Order lists', async () => {
    bot.tfc.useFile(path.join(localDir,'test','DACbCache.json'));  // Simulate no buys
    const consoleSpy = jest.spyOn(console, 'log');
    await man.doCommands(['list C 5']);
    // await bot.sleep(2000);
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OYKGBX-A5JA2-VATI6N/));
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OY3JGW-HVFLA-U2S3L4/));
    await man.doCommands(['list C -5']);
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OX57R3-REKZO-3GL7HY/));
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OBTWTY-46LXB-7UCHKW/));
    consoleSpy.mockRestore();
});

test('Web Page Data', (done) => {
    async function WPD() {
        bot.tfc.useFile(path.join(localDir,'test','DACbCache.json'));  // Simulate no buys
        // const consoleSpy = jest.spyOn(console, 'log');
        await man.doCommands(['web on 8155']);
        const options = {
            host: 'localhost',
            port: 8155,
            path: '/data',
            auth: 'admin:TestPW'
        }
        const request = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                const objData = JSON.parse(data);
                expect(objData).toHaveProperty('orders');
                expect(objData).toHaveProperty('grid');
                expect(objData).toHaveProperty('savings');
                expect(objData).toHaveProperty('exsaves');
                expect(objData).toHaveProperty('numer');
                expect(objData).toHaveProperty('tickers');
                expect(objData).toHaveProperty('total');
                expect(objData).toHaveProperty('current');
                expect(objData).toHaveProperty('desired');
                expect(objData).toHaveProperty('adjust');
                expect(objData).toHaveProperty('ranges');
                expect(objData).toHaveProperty('FLAGS');
                expect(objData).toHaveProperty('refresh_period');
                expect(objData).toHaveProperty('closed');
                man.doCommands(['web off']);
                done();
            });
        });
        request.on('error', (e) => {
            console.log(e.message);
        });
        request.end();
    }
    WPD();
}, 25000);

test('Collect more old orders', async () => {
    bot.tfc.useFile(path.join(localDir, 'test', 'co474.json'));
    const consoleSpy = jest.spyOn(console, 'log');
    await man.doCommands(['list CR']);  // Clear and collect 300 results
//    CR might not be doing enough.  
//    The offset goes to 200 too fast for this test to work.
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Restting closed orders record./));
    await man.doCommands(['list C']);
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OUBWSG-GNKS3-PJ24H5/));
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OYKGBX-A5JA2-VATI6N/));
    await man.doCommands(['list C -2']);   // See the first two.
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OBTWTY-46LXB-7UCHKW/));
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OX57R3-REKZO-3GL7HY/));
    // Test that it will continue collecting when there are
    // freshly executed orders and still very old orders.
    // Say it's a new account. (NACache.json has 5 orders.)
    bot.tfc.clearCache();
    consoleSpy.mockClear();
    bot.tfc.useFile(path.join(localDir, 'test', 'NACache.json'));
    await man.doCommands(['list CR']);
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Restting closed orders record./));
    await man.doCommands(['list C']);  // Clear and collect all four results
        expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OYKGBX-A5JA2-VATI6N/));
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OBQMPV-7W5XR-4VGDTT/));
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/collected all orders/));

    // Edge case: Exactly 51 results on first attempt, so the oldest
    // isn't collected. Later, there are 51 more, so the oldest still
    // isn't collected. The one in the middle and the oldest are still
    // uncollected. One request for two more orders should get them
    // both, but it need only be for one more if the newest was a
    // cancellation.
    bot.tfc.clearCache();
    consoleSpy.mockClear();
    bot.tfc.useFile(path.join(localDir, 'test', '51A.json'));
    await man.doCommands(['list CR']);
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Restting closed orders record./));
    await man.doCommands(['list C']);  // Clear and collect 1st 50 results
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OBTWTY-46LXB-7UCHKW/)
    );
    expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/OX57R3-REKZO-3GL7HY/)
    );

    bot.tfc.useFile(path.join(localDir, 'test', '51B.json'));
    await man.doCommands(['list CR']);
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Restting closed orders record./));
    await man.doCommands(['list C']);  // Clear and collect 1st 50 results
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/O44O3G-4S7MM-7LH6KN/)
    );

    bot.tfc.useFile(path.join(localDir, 'test', '51C.json'));
    await man.doCommands(['list CR']);
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Restting closed orders record./));
    await man.doCommands(['list C 100']);  // Collect all orders
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OXZQ7D-FAKED-WYS5PS/)
    );
    expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/OX57R3-REKZO-3GL7HY/)
    );
})