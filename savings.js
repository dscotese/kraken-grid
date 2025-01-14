import fs from 'fs';
import PSCon from 'prompt-sync';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(__filename);
const prompt = PSCon({sigint: true});
let bot;

function Savings(j=false) { // Constructor for savings
    let assets = [{ticker:'ZUSD',amount:0}];
    let label = "default";
    let myTotal = 0;
    // eslint-disable-next-line global-require
    let AllocCon;

    function labelMe(l) { label = l; }

    function save() { // Returns what must be passed to recover
        return JSON.stringify({assets,label});
    }

    // eslint-disable-next-line no-unused-vars
    function toString() {
        return save();
    }

    function getTotal() {
        return myTotal;
    }

    async function getAlloc(numeraireIn, numeraires) {
        let already = assets.find(a => a.ticker === numeraireIn);
            let i = 0;
            let total = 0;
            let price = 0;
            const pairs = []; 
            const values = [];
            const alloc = [];
            const pairMap = []; 
        while(!already) {
            const n = numeraires[i];
            already = assets.find(a => a.ticker === n);
            i += 1;
        }
        if(!already) {
            throw new Error("Unable to determine default asset");
        }
        const numeraire = already.ticker;
        Object.entries(assets).forEach(async ([,a]) => {
            if(a.ticker !== numeraire) {
                pairMap[a.ticker] = bot.findPair(a.ticker, numeraire);
                if(pairMap[a.ticker] !== '' && !pairs.includes(pairMap[a.ticker]))
                    pairs.push(pairMap[a.ticker]);
                if(!bot.getPairs()[pairMap[a.ticker]]) {
                    price = await bot.getPrice(a.ticker);
                    values[a.ticker] = a.amount * price;
                }
            }
        });
        const prices = await bot.kapi(['Ticker',{ pair: 
            pairs.join().replace(/^,+|,+$/g,'').replace(/,,/g,',')}]);
        assets.forEach(a => {
            if(typeof(values[a.ticker]) === 'undefined') {  // `.c[0]` is specific to Kraken's price JSON
                values[a.ticker] = a.amount * (a.ticker === numeraire ? 1
                    : prices.result[bot.getPairs()[pairMap[a.ticker]].pair].c[0]);
            }
            total += values[a.ticker];
        });
        assets.forEach(a => {
            alloc.push({ticker:a.ticker, target:values[a.ticker]/total});
        });
        myTotal = total;
        return AllocCon({bot, Savings},alloc);
    }  

    function recover() {
        let x;
        if(typeof j === 'string' || j instanceof String) {
            try {
                x = JSON.parse(j);
            } catch (err) {
                console.log("failed with: ",j);
                throw err;
            }
        } else x = j;
        assets = x.assets || assets;
        label = x.label || label;
        AllocCon = x.AllocCon;
// console.log("Savings recovered:",{x:x,assets:assets,label:label});
    }

    if(j) recover();

    function badTickerOK(ticker) {
        return prompt(`Use unrecognized ${  ticker  }?`).toLowerCase() === 'y';
    }

    function updateAsset(ticker,amountIn,ask,allowAdd = false) {
        const already = assets.find(a => a.ticker === ticker);
        let amount = amountIn;
        if(!already && !Savings.tickers.has(ticker) 
            && (ask && !badTickerOK(ticker)))
            return false;
        if(!already && (allowAdd || amount !== 0)) {
            assets.push({ticker,amount:Number(amount)});
        } else {
            if( !already && amount === 0 ) {
                console.log("Ignoring request to record 0 units of", ticker);
                return false;
            }
            if(allowAdd) amount += already.amount;

            if(!ask || prompt(`Update ${  already.amount  }${ticker 
                 } to ${  amount  }?`).toLowerCase() === 'y') {
                already.amount = amount;
            } else return false;
        }
        return true;
    }

    function w(n,x) { const s = n.toString(); return s+' '.repeat(x-s.length); }

    function setTickers(validTickers) {
        validTickers.forEach(i => { Savings.tickers.add(i); });
    }

    function validTicker(t) { return Savings.tickers.has(t); }

    function showAsset(a,sep='\t') { return w(a.ticker,6) + sep + a.amount; }

    function list(labelIn = this.label, copySort = false) {
        // return "Would list "+assets.length+" assets.";

        let str = `ticker\tunits (Account: ${labelIn})`;
            let a; let lj=0;
            const assetsL=copySort
                ? Array.from(assets).sort((la,b)=>la.ticker<b.ticker?-1:1)
                : assets;;
        for(let h=0; h < assetsL.length; h += 1) {
            a = assetsL[h];
            str = `${str  }\n(${  h  }) ${ showAsset(a,"\t")}`;
            lj += 1;
            if(lj > 100) break;
        }
        return str;
    }

    function setBase(ticker) {
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

    function remove(ticker) {
        const idx = assets.findIndex(a=> a.ticker === ticker);
        if(idx === -1) { // findIndex didn't find an index!
            console.log("No such asset: ticker");
        } else {
            const r = assets.splice(idx,1);
            console.log("Removed", r,':\n', list());
        }
    }

    function add(sav2) {
        let ea;
        sav2.assets.forEach(a => {
            ea = assets.find(t => t.ticker === a.ticker);   
            if(typeof ea === 'undefined') {
                assets.push({ticker: a.ticker, amount: a.amount});
            } else {
                ea.amount += a.amount;
            };
        });
    // console.log(list());
    }

    function get(ticker) {
        return typeof((assets.find(a => a.ticker === ticker)))==='undefined' 
            ? '' : showAsset(assets.find(a => a.ticker === ticker));
    }

    return {setBase, list, setTickers, updateAsset, recover,
        labelMe, save, label, getAlloc, getTotal, add, remove,
        get, assets, validTicker};
}

Savings.init = function init(initbot) {
    bot = initbot;
    Savings.tickers = Savings.tickers || new Set(bot.getTickers());

    Savings.setPricer = (pricer, assets) => {
        // pricer must be an async function price(a)
        // which accepts an asset symbol and returns the
        // price you want to use for it.
    // console.trace("pricer:",pricer);
        assets.forEach(a => { 
            if(typeof(pricer.price) === 'function') Savings.pricers[a] = pricer;
            else throw new Error('setPricer received pricer without price function.');
        });
    }
    if(!bot.getExtra()) throw new Error('You must pass an initialized bot to Savings.init().');

    Savings.pricers = [];
    const bex = bot.getExtra();             // What is it now?
    const ExAsStr = JSON.stringify(bex);    // To see if it changes.
    const files = fs.readdirSync(path.join(__dirname,'pricers'));
//    const files = fs.readdirSync('./pricers');
    files.forEach( async ( file ) => {
        // eslint-disable-next-line import/no-dynamic-require, global-require
//        const toImport = path.join(process.cwd(),'pricers',file).replace('\\','/');
        const toImport = path.join(__dirname,'pricers',file).replace('\\','/');
        console.log(toImport);
        if(file.endsWith('.js')) {
            // Unless we import the static string under test conditions,
            // the debugger (VSCode or eslint) chokes on this import.
            // import( './pricers/openex.js' ) .jstoImport )
            import( process.env.VSCODE_NONCE || process.env.VSCODE_STABLE
                ? './pricers/openex.js' : toImport )
                .then(p1 => { p1.default.then(pricer => {
                    pricer(bex,Savings); 
                    if(JSON.stringify(bex) !== ExAsStr) 
                        bot.save();
                    return true;
                }).catch((e) => {
                    console.log(`Pricer from ${toImport} unavailable: ${e.message}.`);
                });
                return true;
            }).catch((e) => {
                console.log(`Import of ${toImport} failed: ${e.message}.`);
            });
        }
    });
}

export default Savings;
