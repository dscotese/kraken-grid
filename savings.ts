import fs from 'fs';
import PSCon from 'prompt-sync';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

// TypeScript definitions for savings.ts
export interface Asset {
    ticker: string;
    amount: number;
}

export interface SavingsConfig {
    label?: string;
    assets?: Asset[];
    AllocCon?: any;
}

export interface SavingsInstance {
    setBase: (ticker: string) => void;
    list: (label?: string, copySort?: boolean) => string;
    setTickers: (validTickers: string[]) => void;
    updateAsset: (ticker: string, amount: number, ask: boolean, allowAdd?: boolean) => boolean;
    recover: () => void;
    labelMe: (label: string) => void;
    save: () => string;
    getAlloc: (numeraireIn: string, numeraires: string[]) => Promise<any>;
    getTotal: () => number;
    add: (sav2: SavingsInstance) => void;
    remove: (ticker: string) => void;
    get: (ticker: string) => string;
    assets: Asset[];
    label: string;
    validTicker: (t: string) => boolean;
    pricers?: Pricer[];
    setPricer?: (pricer: Pricer, assets: string[]) => void;
}

export interface Pricer {
    price: (ticker: string) => Promise<number>;
    [key: string]: any;
}

export interface SavingsConstructor {
    (config?: SavingsConfig | string | boolean): SavingsInstance;
    tickers: Set<string>;
    pricers: Pricer[];
    setPricer: (pricer: Pricer, assets: string[]) => void;
    init: (initbot: any) => void;
}

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(__filename);
const prompt = PSCon({sigint: true});
let bot: any;

const Savings = function(config: SavingsConfig | string | boolean = false): SavingsInstance {
    let assets: Asset[] = [{ticker: 'ZUSD', amount: 0}];
    let label = "default";
    let myTotal = 0;
    // eslint-disable-next-line global-require
    let AllocCon: any;

    function labelMe(l: string): void { 
        label = l; 
    }

    function save(): string { 
        // Returns what must be passed to recover
        return JSON.stringify({assets, label});
    }

    // eslint-disable-next-line no-unused-vars
    function toString(): string {
        return save();
    }

    function getTotal(): number {
        return myTotal;
    }

    async function getAlloc(numeraireIn: string, numeraires: string[]): Promise<any> {
        let already = assets.find(a => a.ticker === numeraireIn);
        let i = 0;
        let total = 0;
        let price = 0;
        const pairs: string[] = []; 
        const values: Record<string, number> = {};
        const alloc: any[] = [];
        const pairMap: Record<string, any> = {}; 
        
        while(!already && i < numeraires.length) {
            const n = numeraires[i];
            already = assets.find(a => a.ticker === n);
            i += 1;
        }
        
        if(!already) {
            throw new Error("Unable to determine default asset");
        }
        
        const numeraire = already.ticker;
        
        for (const a of assets) {
            if(a.ticker !== numeraire) {
                pairMap[a.ticker] = bot.findPair(a.ticker, numeraire);
                if(pairMap[a.ticker] !== '' && !pairs.includes(pairMap[a.ticker]))
                    pairs.push(pairMap[a.ticker]);
                if(!bot.getPairs()[pairMap[a.ticker]]) {
                    price = await bot.getPrice(a.ticker);
                    values[a.ticker] = a.amount * price;
                }
            }
        }
        
        const prices = await bot.kapi(['Ticker', { pair: 
            pairs.join().replace(/^,+|,+$/g, '').replace(/,,/g, ',')}]);
            
        assets.forEach(a => {
            if(typeof(values[a.ticker]) === 'undefined') {  // `.c[0]` is specific to Kraken's price JSON
                values[a.ticker] = a.amount * (a.ticker === numeraire ? 1
                    : prices.result[bot.getPairs()[pairMap[a.ticker]].pair].c[0]);
            }
            total += values[a.ticker];
        });
        
        assets.forEach(a => {
            alloc.push({ticker: a.ticker, target: values[a.ticker] / total});
        });
        
        myTotal = total;
        return await AllocCon({bot, Savings}, alloc);
    }  

    function recover(): void {
        let x: any;
        if(typeof config === 'string' || config instanceof String) {
            try {
                x = JSON.parse(config as string);
            } catch (err) {
                console.log("failed with: ", config);
                throw err;
            }
        } else x = config;
        
        assets = x.assets || assets;
        label = x.label || label;
        AllocCon = x.AllocCon;
    }

    if(config) recover();

    function badTickerOK(ticker: string): boolean {
        return prompt(`Use unrecognized ${ticker}?`).toLowerCase() === 'y';
    }

    function updateAsset(ticker: string, amountIn: number, ask: boolean, allowAdd: boolean = false): boolean {
        const already = assets.find(a => a.ticker === ticker);
        let amount = amountIn;
        
        if(!already && !Savings.tickers.has(ticker) 
            && (ask && !badTickerOK(ticker)))
            return false;
            
        if(!already && (allowAdd || amount !== 0)) {
            assets.push({ticker, amount: Number(amount)});
        } else {
            if(!already && amount === 0) {
                console.log("Ignoring request to record 0 units of", ticker);
                return false;
            }
            if(allowAdd && already) amount += already.amount;

            if(already && (!ask || prompt(`Update ${already.amount}${
                ticker} to ${amount}?`).toLowerCase() === 'y')) {
                already.amount = amount;
            } else return false;
        }
        return true;
    }

    function w(n: any, x: number): string { 
        const s = n.toString(); 
        return s + ' '.repeat(x - s.length); 
    }

    function setTickers(validTickers: string[]): void {
        validTickers.forEach(i => { Savings.tickers.add(i); });
    }

    function validTicker(t: string): boolean { 
        return Savings.tickers.has(t); 
    }

    function showAsset(a: Asset, sep: string = '\t'): string { 
        return w(a.ticker, 6) + sep + a.amount; 
    }

    function list(labelIn: string = label, copySort: boolean = false): string {
        let str = `ticker\tunits (Account: ${labelIn})`;
        let a: Asset; 
        let lj = 0;
        const assetsL = copySort
            ? Array.from(assets).sort((la, b) => la.ticker < b.ticker ? -1 : 1)
            : assets;
            
        for(let h = 0; h < assetsL.length; h += 1) {
            a = assetsL[h];
            str = `${str}\n(${h}) ${showAsset(a, "\t")}`;
            lj += 1;
            if(lj > 100) break;
        }
        return str;
    }

    function setBase(ticker: string): void {
        // TODO: We may already have this in this savings,
        //  and if so, swap the ticker and amounts.
        // Otherwise, we need to save the amount of the old
        //  numeraire and add it, and set the amount of the new
        //  one to zero.
        // ----------------------------------------------------
        if(!Savings.tickers.has(ticker)
            || badTickerOK(ticker))
            assets[0].ticker = ticker;
    }

    function remove(ticker: string): void {
        const idx = assets.findIndex(a => a.ticker === ticker);
        if(idx === -1) { // findIndex didn't find an index!
            console.log("No such asset:", ticker);
        } else {
            const r = assets.splice(idx, 1);
            console.log("Removed", r, ':\n', list());
        }
    }

    function add(sav2: SavingsInstance): void {
        sav2.assets.forEach(a => {
            const ea = assets.find(t => t.ticker === a.ticker);   
            if(typeof ea === 'undefined') {
                assets.push({ticker: a.ticker, amount: a.amount});
            } else {
                ea.amount += a.amount;
            }
        });
    }

    function get(ticker: string): string {
        const toGet = assets.find(a => a.ticker === ticker);
        return typeof(toGet) === 'undefined' 
            ? '' : showAsset(toGet);
    }

    return {
        setBase, list, setTickers, updateAsset, recover,
        labelMe, save, label, getAlloc, getTotal, add, remove,
        get, assets, validTicker
    };
} as SavingsConstructor;

// Static properties and methods
Savings.tickers = new Set<string>();

Savings.init = function init(initbot: any): void {
    bot = initbot;
    Savings.tickers = new Set(bot.getTickers());

    Savings.setPricer = (pricer: Pricer, assets: string[]): void => {
        // pricer must be an async function price(a)
        // which accepts an asset symbol and returns the
        // price you want to use for it.
        assets.forEach(a => { 
            if(typeof(pricer.price) === 'function') Savings.pricers[a] = pricer;
            else throw new Error('setPricer received pricer without price function.');
        });
    }
    
    if(!bot.getExtra()) throw new Error('You must pass an initialized bot to Savings.init().');

    Savings.pricers = [];
    const bex = bot.getExtra();             // What is it now?
    const ExAsStr = JSON.stringify(bex);    // To see if it changes.
    const files = fs.readdirSync(path.join(__dirname, 'pricers'));
    
    files.forEach(async (file) => {
        const toImport = path.join(__dirname, 'pricers', file).replace('\\', '/');
        console.log(toImport);
        
        if(file.endsWith('.js')) {
            // Unless we import the static string under test conditions,
            // the debugger (VSCode or eslint) chokes on this import.
            // import( './pricers/openex.js' ) .jstoImport )
            try {
                const p1 = await import(process.env.VSCODE_NONCE || process.env.VSCODE_STABLE
                    ? '../pricers/openex.js' : toImport);
                    
                const pricer = await p1.default;
                pricer(bex, Savings); 
                
                if(JSON.stringify(bex) !== ExAsStr) 
                    bot.save();
                    
                return true;
            } catch (e) {
                console.log(`Import of ${toImport} failed: ${(e as Error).message}.`);
                return false;
            }
        }
        return false;
    });
}

export default Savings;