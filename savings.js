const prompt = require('prompt-sync')({sigint: true});
const Allocation = require('./allocation.js');
const Bot = require('./bot.js');
function Savings(j=false) { // Constructor for savings
    let assets = [{ticker:'ZUSD',amount:0}],
        label = "default",
        myTotal = 0;

    function labelMe(l) { label = l; }

    function save() { // Returns what must be passed to recover
        return JSON.stringify({assets,label});
    }

    function toString() {
        return save();
    }

    function getTotal() {
        if(0 == myTotal) console.log("Call allocation first.");
        return myTotal;
    }

    async function getAlloc(numeraire, numeraires) {
        let already = assets.find(a => a.ticker == numeraire),
            i = 0,
            bot = Bot.s,
            total = 0,
            price = 0,
            pairs = [], 
            values = [],
            alloc = [],
            pairMap = []; 
        while(!already) {
            already = assets.find(a => a.ticker == numeraires[i++]);
        }
        if(!already) {
            throw("Unable to determine default asset");
        }
        numeraire = already.ticker;
        for(a of assets) {
            if(a.ticker != numeraire) {
                pairMap[a.ticker] = Bot.findPair(a.ticker, numeraire);
                if(pairMap[a.ticker] != '' && !pairs.includes(pairMap[a.ticker]))
                    pairs.push(pairMap[a.ticker]);
                if(!Bot.pairs[pairMap[a.ticker]]) {
                    price = await bot.getPrice(a.ticker);
                    values[a.ticker] = a.amount * price;
                }
            }
        };
        prices = await bot.kapi(['Ticker',{ pair: 
            pairs.join().replace(/^,+|,+$/g,'').replace(/,,/g,',')}]);
        assets.forEach(a => {
            if('undefined' == typeof(values[a.ticker])) {  // `.c[0]` is specific to Kraken's price JSON
                values[a.ticker] = a.amount * (a.ticker == numeraire ? 1
                    : prices.result[Bot.pairs[pairMap[a.ticker]].pair].c[0]);
            }
            total += values[a.ticker];
        });
        assets.forEach(a => {
            alloc.push({ticker:a.ticker, target:values[a.ticker]/total});
        });
        myTotal = total;
        return Allocation(alloc);
    }  

    function recover(j) {
        let x;
        if(typeof j === 'string' || j instanceof String) {
            try {
                x = JSON.parse(j);
            } catch (err) {
                console.log("failed with: ",j);
                throw err;
            }
        } else x = j;
        assets = x.assets;
        label = x.label;
//console.log("Savings recovered:",{x:x,assets:assets,label:label});
    }

    if(j) recover(j);

    function updateAsset(ticker,amount,ask,add = false) {
        let already = assets.find(a => a.ticker == ticker);
        if(!already && !Savings.tickers.includes(ticker) 
            && (ask && !badTickerOK(ticker)))
            return false;
        if(!already && (add || amount != 0)) {
            assets.push({ticker:ticker,amount:Number(amount)});
        } else {
            if( !already && amount == 0 ) {
                console.log("Ignoring request to record 0 units of", ticker);
                return false;
            }
            if(add) amount += already.amount;

            if(!ask || 'y' == prompt('Update ' + already.amount + ticker 
                + ' to ' + amount + '?').toLowerCase()) {
                already.amount = amount;
            } else return false;
        }
        return true;
    }

    function w(n,x) { let s = n.toString(); return s+' '.repeat(x-s.length); }

    function setTickers(validTickers) {
        Savings.tickers = validTickers;
    }

    this.validTicker = (t) => { return Savings.tickers.includes(t); }

    function list(label = this.label, copySort = false) {
        //return "Would list "+assets.length+" assets.";

        let str = "ticker\tunits (Account: "+label+")",
            a,j=0,
            assetsL=copySort
                ? Array.from(assets).sort((a,b)=>{return a.ticker<b.ticker?-1:1;})
                : assets;;
        for(let h=0; h < assetsL.length; ++h) {
            a = assetsL[h];
            str = str + "\n(" + h + ") " + showAsset(a,"\t");
            if(100 < (j = j+1)) break;
        }
        return str;
    }

    function showAsset(a,sep='\t') { return w(a.ticker,6) + sep + a.amount; }

    function setBase(ticker) {
        // TODO: We may already have this in this savings,
        //  and if so, swap the ticker and amounts.
        // Otherwise, we need to save the amount of the old
        //  numeraire and add it, and set the amount of the new
        //  one to zero.
        // ----------------------------------------------------
        if(!Savings.tickers.includes(ticker)
            || badTickerOK(ticker))
            assets[0].ticker = ticker;
    }

    function badTickerOK(ticker) {
        return 'y' == prompt('Use unrecognized ' + ticker + '?').toLowerCase();
    }

    function remove(ticker) {
        let idx = assets.findIndex(a=> {return a.ticker == ticker});
        if(idx == -1) { // findIndex didn't find an index!
            console.log("No such asset: ticker");
        } else {
            let r = assets.splice(idx,1);
            console.log("Removed", r,':\n', list());
        }
    }

    function add(sav2) {
        let ea;
        sav2.assets.forEach(a => {    
            if('undefined' ==
                typeof((ea = assets.find(t => {return t.ticker == a.ticker})))) {
                assets.push({ticker: a.ticker, amount: a.amount});
            } else {
                ea.amount += a.amount;
            };
        });
    // console.log(list());
    }

    function get(ticker) {
        let a = assets.find(a=>{return a.ticker == ticker;});
        return 'undefined'==typeof(a) ? '' : showAsset(a);
    }

    return {setBase, list, setTickers, updateAsset, recover,
        labelMe, save, label, setTickers, getAlloc, getTotal,
        add, remove, get, assets, validTicker:this.validTicker};
}
Savings.tickers = [];
var glob = require( 'glob' )
  , path = require( 'path' );

Savings.setPricer = (pricer, assets) => {
    // pricer must be an async function price(a)
    // which accepts an asset symbol and returns the
    // price you want to use for it.
console.log("pricer:",pricer);
    assets.forEach(a => { 
        if('function' == typeof(pricer.price)) Savings.pricers[a] = pricer;
        else throw 'setPricer received pricer without price function.';
    });
}
if(!Bot.extra) throw 'Initialize bot before loading savings.';

Savings.pricers = [];
glob.sync("./pricers/*.js").forEach( function( file ) {
  require( path.resolve( file ) )(Savings);
});

module.exports = Savings;
