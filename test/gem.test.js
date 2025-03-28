/* eslint-disable import/extensions */
/* eslint-disable no-console */
import {expect, describe, test, jest, afterEach} from '@jest/globals';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import fnInit from "../ginit";
import customExpect from './customExpect';
import TFC from '../testFasterCache.js'

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(__filename);

jest.setTimeout(30000); // Increase timeout to 30 seconds
describe( 'Testing Gemini', () => {
    process.TESTING = 'cacheOnly';  // Do not use Kraken during testing.
    process.USECACHE = 'G';
    let a; 
    let bot; 
    let man;
    let AllocCon;
    let argvOrig;

    function setArgv() {
        argvOrig = process.argv;
        process.argv = ["node", "./ginit.js"];
    }

    function resetArgv() {
        process.argv = argvOrig;
    }

    beforeEach( setArgv );

    afterEach( resetArgv );

    beforeAll(async () => {
        setArgv();
        const allConfig = await fnInit();    // Initialize Manager.
        ({bot, man, AllocCon} = allConfig);
        // TestPW is a special password (prefix) that blocks encryption so
        // that the file storing API keys and other sensitive data can be
        // altered as necessary for tests. By initializing man with a password,
        // we bypass the call to prompt so no user input is required.
        // We pass false to fnInit to avoid initializing man.
        // man initializes bot using a password passed to it.
//        man.init("TestPW")
        // Not testing the command ine interface (yet?)
        man.ignore();
        a = await AllocCon({bot, Savings:null});
        a.addAsset('XBT',0.4);
        a.addAsset('XMR',0.4);
        // console.log('bot is ', bot);
        resetArgv();
    });

    test('Overallocation prevention', () => {
        let gotErr = false;
        try {
            a.addAsset('DASH',0.3);
        } catch(err) {
            gotErr = true;
        }
        customExpect(gotErr).toBe(true);
    });

    test('Base Currency Tracking', async () => {
        const asset0 = await a.get(0);
        const targ0 = asset0.target;
        customExpect(Math.round(10*targ0)).toBe(2);
    });

    test('Update Allocation', async () => {
        a.addAsset('XBT',0.5);
        customExpect(Math.round(10*(await a.get(0)).target)).toBe(1);
    });

    test('setBase to (Z)EUR', async () => {
        let asset0 = await a.get(0);
        customExpect(asset0.ticker).toBe("ZUSD");
        a.setNumeraire('ZEUR');
        asset0 = await a.get(0);
        customExpect(asset0.ticker).toBe("ZEUR");
        a.setNumeraire('ZUSD');
        asset0 = await a.get(0);
        customExpect(asset0.ticker).toBe("ZUSD");
    });

    test('Wait for the portfolio', async () => {
        await bot.report();
//        debug("bot.getPortfolio().Allocation.assets:\n", 
//            bot.getPortfolio().Allocation.assets);
        customExpect(Object.keys(bot.getPortfolio()).length > 6).toBeTruthy();
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
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining("not a recognized"));
    //    captureLog("Done at 102",all);
        customExpect(bot.getPortfolio().O.length === orderCount).toBeTruthy();
        consoleSpy.mockRestore();
    // },10000);

        // Try a good symbol
        // -----------------
        await man.doCommands(['buy BTC 1 25']);    // I wish!
        // Install file with extra order:
        bot.tfc.useFile(path.join(__dirname,'8open.json'));
    //    captureLog("Reporting 8open...", all);
        await bot.report();
    //    captureLog("8open done.", all);
        console.log("Order count is",orderCount,":",
            bot.getPortfolio().O.map(e => e[0]));
        customExpect(bot.getPortfolio().O.length === 1+orderCount).toBeTruthy();
        if(bot.getPortfolio().O.length === 1+orderCount) {
            bot.FLAGS.safe = false;
            await bot.kill(1,bot.getPortfolio().O);
            bot.FLAGS.safe = true;
            bot.tfc.useFile(path.join(__dirname,'7open.json'));
            await bot.report();
            customExpect(bot.getPortfolio().O.length === orderCount).toBeTruthy();
        }

        // Toggling risky
        // --------------
        const r0 = bot.showState().substr(-2,1);
        await man.doCommands(['risky','risky','risky']);
        customExpect(bot.showState().substr(0,1) !== r0).toBeTruthy();

        // Test that Safemode prevents orders over $25
        // -------------------------------------------
        await man.doCommands(['buy XBT 1 50']); // Fails because not safe.
        customExpect(bot.getPortfolio().O.length === orderCount).toBeTruthy();
        bot.showPair('XREPZUSD');        
        // Test that showPair returns a real pair
        // --------------------------------------
        const pair = bot.pairInfo('XREPZUSD');
        customExpect(pair.quote === 'ZUSD').toBeTruthy();
        customExpect(pair.base === 'XREP').toBeTruthy();
    },200000);

    test('AssetPairs - CLosedOrders', async () => {
        bot.tfc.useFile(path.join(__dirname,'GemCache.json'));
        const consoleSpy = jest.spyOn(console, 'log');
        await bot.report();
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Reading Asset Pairs.../));
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Reading Tickers.../));
            consoleSpy.mockRestore();
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/ZEC.*20000/));
            consoleSpy.mockRestore();
        //    captureLog("Sell tested.",console);
    },10000);

    test('Dynamic Buy Amount Calculation', async () => {
        bot.tfc.useFile(path.join(__dirname,'DACbCacheG.json'));  // Simulate no buys
    //    captureLog("Add a buy",console);
        const consoleSpy = jest.spyOn(console, 'log');
        await bot.report();
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/buying 0.6573442493668066 XBTUSD at 62777/));
        consoleSpy.mockRestore();

            //    captureLog("Buy tested.",console);
    },10000);

    test('Closed Order lists', async () => {
        bot.tfc.useFile(path.join(__dirname,'DACbCacheG.json'));  // Simulate no buys
        const consoleSpy = jest.spyOn(console, 'log');
        await man.doCommands(['list C 5']);
        // await bot.sleep(2000);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OYKGBX-A5JA2-VATI6N/));
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OY3JGW-HVFLA-U2S3L4/));
        await man.doCommands(['list C -5']);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OX57R3-REKZO-3GL7HY/));
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OBTWTY-46LXB-7UCHKW/));
        consoleSpy.mockRestore();
    });

    test('Web Page Data', (done) => {
        async function WPD() {
            bot.tfc.useFile(path.join(__dirname,'DACbCacheG.json'));  // Simulate no buys
            // const consoleSpy = jest.spyOn(console, 'log');
            await man.doCommands(['web on 8155']);
            const options = {
                host: 'localhost',
                port: 8155,
                path: '/data',
                auth: 'admin:TestPWG'
            }
            const request = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    const objData = JSON.parse(data);
                    customExpect(objData).toHaveProperty('orders');
                    customExpect(objData).toHaveProperty('grid');
                    customExpect(objData).toHaveProperty('savings');
                    customExpect(objData).toHaveProperty('exsaves');
                    customExpect(objData).toHaveProperty('numer');
                    customExpect(objData).toHaveProperty('tickers');
                    customExpect(objData).toHaveProperty('total');
                    customExpect(objData).toHaveProperty('current');
                    customExpect(objData).toHaveProperty('desired');
                    customExpect(objData).toHaveProperty('adjust');
                    customExpect(objData).toHaveProperty('ranges');
                    customExpect(objData).toHaveProperty('FLAGS');
                    customExpect(objData).toHaveProperty('refresh_period');
                    customExpect(objData).toHaveProperty('closed');
                    man.doCommands(['web off']).then(() => {
                        done();
                    });
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
        bot.tfc.useFile(path.join(__dirname, 'co474G.json'));
        const consoleSpy = jest.spyOn(console, 'log');
        await man.doCommands(['list CR']);  // Clear and collect 300 results
    //    CR might not be doing enough.  
    //    The offset goes to 200 too fast for this test to work.
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Restting closed orders record./));
        await man.doCommands(['list C']);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OUBWSG-GNKS3-PJ24H5/));
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OYKGBX-A5JA2-VATI6N/));
        await man.doCommands(['list C -2']);   // See the first two.
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OBTWTY-46LXB-7UCHKW/));
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OX57R3-REKZO-3GL7HY/));
        // Test that it will continue collecting when there are
        // freshly executed orders and still very old orders.
        // Say it's a new account. (NACache.json has 5 orders.)
        bot.tfc.clearCache();
        consoleSpy.mockClear();
        bot.tfc.useFile(path.join(__dirname, 'NACacheG.json'));
        await man.doCommands(['list CR']);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Restting closed orders record./));
        await man.doCommands(['list C']);  // Clear and collect all four results
            customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OYKGBX-A5JA2-VATI6N/));
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OBQMPV-7W5XR-4VGDTT/));
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/collected all orders/));

        // Edge case: Exactly 51 results on first attempt, so the oldest
        // isn't collected. Later, there are 51 more, so the oldest still
        // isn't collected. The one in the middle and the oldest are still
        // uncollected. One request for two more orders should get them
        // both, but it need only be for one more if the newest was a
        // cancellation.
        bot.tfc.clearCache();
        consoleSpy.mockClear();
        bot.tfc.useFile(path.join(__dirname, '51A.json'));
        await man.doCommands(['list CR']);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Restting closed orders record./));
        await man.doCommands(['list C']);  // Clear and collect 1st 50 results
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OBTWTY-46LXB-7UCHKW/)
        );
        customExpect(consoleSpy).not.toHaveBeenCalledWith(
            expect.stringMatching(/OX57R3-REKZO-3GL7HY/)
        );

        bot.tfc.useFile(path.join(__dirname, '51B.json'));
        await man.doCommands(['list CR']);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Restting closed orders record./));
        await man.doCommands(['list C']);  // Clear and collect 1st 50 results
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/O44O3G-4S7MM-7LH6KN/)
        );

        bot.tfc.useFile(path.join(__dirname, '51C.json'));
        await man.doCommands(['list CR']);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Restting closed orders record./));
        await man.doCommands(['list C 100']);  // Collect all orders
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OXZQ7D-FAKED-WYS5PS/)
        );
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OX57R3-REKZO-3GL7HY/)
        );
    });
    
});