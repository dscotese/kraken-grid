/* eslint-disable import/extensions */
/* eslint-disable no-console */
import {expect, describe, test, jest} from '@jest/globals';
import http from 'http';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import fnInit from "../init.js";
import customExpect from './customExpect.js';
import TFC from '../testFasterCache.js';

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(__filename);

interface Mutex {
  locked: boolean;
  queue: (() => void)[];
  lock: () => Promise<void>;
  unlock: () => void;
}

const mutex: Mutex = {
    locked: false,
    queue: [],
    lock: async function() {
      if (this.locked) {
        await new Promise<void>(resolve => this.queue.push(resolve));
      }
      this.locked = true;
    },
    unlock: function() {
      this.locked = false;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
};

describe('Test Kraken', () => {
    process.TESTING = 'cacheOnly';  // Do not use Kraken during testing.
    process.USECACHE = 'K';
    let a: any; 
    let bot: any; 
    let man: any;
    let AllocCon: any;
    let argvOrig: string[];

    async function setArgv(): Promise<void> {
        await mutex.lock();
        argvOrig = process.argv;
        process.argv = ["node", "./init.js"];
    }

    function resetArgv(): void {
        process.argv = argvOrig;
        mutex.unlock();
    }

    beforeEach(setArgv);

    afterEach(resetArgv);

    beforeAll(async () => {
        jest.setTimeout(30000); // Increase timeout to 30 seconds
        const tfc = TFC(true, 'test');        // Create or use the TFCtest folder.
        // Load the singleton Cache with test data:
        tfc.useFile(path.join(__dirname, 'krakCache.json'));
        const allConfig = await fnInit();    // Initialize Manager.
        ({bot, man, AllocCon} = allConfig);
        // TestPW is a special password (prefix) that blocks encryption so
        // that the file storing API keys and other sensitive data can be
        // altered as necessary for tests. By initializing man with a password,
        // we bypass the call to prompt so no user input is required.
        // We pass false to fnInit to avoid initializing man.
        // man initializes bot using a password passed to it.
        // Not testing the command ine interface (yet?)
        man.ignore();
        a = await AllocCon({bot, Savings: null});
        a.addAsset('XBT', 0.4);
        a.addAsset('XMR', 0.4);
        // console.log('bot is ', bot);
        mutex.locked = false; // Ensure mutex starts unlocked
        mutex.queue = [];     // Ensure queue starts empty
    });

    test('Overallocation prevention', () => {
        let gotErr = false;
        try {
            a.addAsset('DASH', 0.3);
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
        a.addAsset('XBT', 0.5);
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
        console.log("bot.getPortfolio().Allocation.assets:\n", 
            bot.getPortfolio().Allocation.assets);
        customExpect(Object.keys(bot.getPortfolio()).length > 6).toBeTruthy();
    }, 10000);

    test('Symbols, toggles, showPair...', async () => {
        // Try a bad symbol
        // ----------------
        await bot.report();
        const orderCount = bot.getPortfolio().O.length;
        console.log("Order count is", orderCount, ":", bot.getPortfolio().O);
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
        await man.doCommands(['buy XBT 1 25']);    // I wish!
        // Install file with extra order:
        bot.tfc.useFile(path.join(__dirname, '8open.json'));
        //    captureLog("Reporting 8open...", all);
        await bot.report();
        //    captureLog("8open done.", all);
        console.log("Order count is", orderCount, ":",
            bot.getPortfolio().O.map(e => e[0]));
        customExpect(bot.getPortfolio().O.length === 1+orderCount).toBeTruthy();
        if(bot.getPortfolio().O.length === 1+orderCount) {
            bot.FLAGS.safe = false;
            await bot.kill(1, bot.getPortfolio().O);
            bot.FLAGS.safe = true;
            bot.tfc.useFile(path.join(__dirname, '7open.json'));
            await bot.report();
            customExpect(bot.getPortfolio().O.length === orderCount).toBeTruthy();
        }

        // Toggling risky
        // --------------
        const r0 = bot.showState().substr(-2, 1);
        await man.doCommands(['risky', 'risky', 'risky']);
        customExpect(bot.showState().substr(0, 1) !== r0).toBeTruthy();

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
    }, 10000);

    test('Dynamic Sell Amount Calculation', async () => {
        bot.tfc.useFile(path.join(__dirname, 'DACsCache.json'));  // Simulate no sells
        //    captureLog("Add a sell",console);
        const consoleSpy = jest.spyOn(console, 'log');
        await bot.report();
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/selling 0.023742124645772522 XBTUSD at 64674.5/));
        consoleSpy.mockRestore();
        //    captureLog("Sell tested.",console);
    }, 10000);

    test('Dynamic Buy Amount Calculation', async () => {
        bot.tfc.useFile(path.join(__dirname, 'DACbCache.json'));  // Simulate no buys
        //    captureLog("Add a buy",console);
        const consoleSpy = jest.spyOn(console, 'log');
        await bot.report();
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/buying 0.6573442493668066 XBTUSD at 62777/));
        consoleSpy.mockRestore();

        //    captureLog("Buy tested.",console);
    }, 10000);

    test('Closed Order lists', async () => {
        bot.tfc.useFile(path.join(__dirname, 'DACbCache.json'));  // Simulate no buys
        await man.doCommands(['list CR']);  // Clear and collect 300 results
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
            bot.tfc.useFile(path.join(__dirname, 'DACbCache.json'));  // Simulate no buys
            // const consoleSpy = jest.spyOn(console, 'log');
            await man.doCommands(['web on 8155']);
            const options = {
                host: 'localhost',
                port: 8155,
                path: '/data',
                auth: 'admin:TestPW'
            };
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
        bot.tfc.useFile(path.join(__dirname, 'co474.json'));
        const consoleSpy = jest.spyOn(console, 'log');
        await man.doCommands(['list CR']);  // Clear and collect 300 results
        //    CR might not be doing enough.  
        //    The offset goes to 200 too fast for this test to work.
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Resetting closed orders record./));
        await man.doCommands(['list C 50']);
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
        bot.tfc.useFile(path.join(__dirname, 'NACache.json'));
        await man.doCommands(['list CR']);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Resetting closed orders record./));
        await man.doCommands(['list C']);  // Clear and collect all four results
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OYKGBX-A5JA2-VATI6N/));
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OBQMPV-7W5XR-4VGDTT/));
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/collected all orders/));

        // Edge case: The 51st result is the oldest closed order, so it
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
            expect.stringMatching(/Resetting closed orders record./));
        await man.doCommands(['list C 25']);  // Clear and collect 1st 50 results
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OBTWTY-46LXB-7UCHKW/)
        );
        customExpect(consoleSpy).not.toHaveBeenCalledWith(
            expect.stringMatching(/OLASTZ-AVM2U-Q26X51/) // /OX57R3-REKZO-3GL7HY/)
        );

        bot.tfc.useFile(path.join(__dirname, '51B.json'));
        await man.doCommands(['list CR']);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Resetting closed orders record./));
        await man.doCommands(['list C 21']);  // Clear and collect 1st 50 results
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/O44O3G-4S7MM-7LH6KN/)
        );

        bot.tfc.useFile(path.join(__dirname, '51C.json'));
        await man.doCommands(['list CR']);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Resetting closed orders record./));
        await man.doCommands(['list C 100']);  // Collect all orders
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OXZQ7D-FAKED-WYS5PS/)
        );
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/OX57R3-REKZO-3GL7HY/)
        );
    }); 

    test('Balance One crypto.', async () => {
        const consoleSpy = jest.spyOn(console, 'log');
        consoleSpy.mockClear();
        bot.tfc.useFile(path.join(__dirname, 'balCache.json'));
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Trying Cache:/), 
            expect.stringMatching(/.*balCache\.json/));
        consoleSpy.mockClear();
        await man.doCommands(["balance 0.025 XXBT"]);
        customExpect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/.* 0.026249 XXBTZUSD at 63025.*/));
    }, 10000);
    
    /*
    test('Play for 5 minutes.', async (done) => {
        console.log("I will error out in five minutes.");
        console.log("Use the CLI as you wish.");
        console.log("Use CTRL-C when you're done.");
        bot.tfc.useFile(path.join(__dirname,'balCache.json'));
        man.listen();
    }, 300000);
    // test("If kill fails", )
    */
});