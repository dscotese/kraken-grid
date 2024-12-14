#!/usr/bin/env node
/* eslint-disable import/extensions */
/* eslint-disable no-console */
import PSCon from 'prompt-sync';
 // ({sigint: true});
import ExchClient from 'kraka-djs';
import ssModule from './safestore.js';     // encrypted sorage
import ReportCon from './reports.js';
import TFC from'./testFasterCache.js';

const  tfc = TFC(process.TESTING,process.argv[2]);
const prompt = PSCon({sigint: true});
const myConfig = {exch: 'kraka-djs'};
export const Bot = (config) => {
    if(config.bot) return config.bot; // Singleton!
    Object.assign(myConfig, config);
    /*
    if( process.env.NODE_ENV === 'production' ) {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        import * as ExchClient from myConfig.exch; // Implements the Kraken API
    } */
    const {Savings, AllocCon} = myConfig;
    let safestore;
    let Reports;
    let pairs = {};
    let tickers = [];
    let Bases;
    let Numeraires;
    let Extra = {};
    const alts = {};

    let exchange;           // The ExchClient from kraka-djs
    const portfolio = {};     // A record of what's on the exchange
    let lCOts = 0;          // Timestamp for use in collecting executed trades.
    const FLAGS = {safe:true,verbose:process.TESTING,risky:false};

    function getPortfolio() { return portfolio; }
    function getConfig() { return myConfig; }
    function getAlts() { return alts; }
    function getTickers() { return tickers; }
    function getPairs() {return pairs; }
    function getExtra() { return Extra; }

    function toDec(n,places) {
        const f = 10**places;
        return Math.round(n*f)/f;
    }

    // Returns a Savings object which includes assets on the exchange.
    function ExchangeSavings() {
        const assets = [];
        Object.keys(portfolio).forEach(key => {
            if(tickers.includes(key)
                && Array.isArray(portfolio[key])
                && portfolio[key].length === 4
                && portfolio[key][3] !== 0) {
                assets.push({ticker:key,amount:toDec(portfolio[key][3],4)});
            }
        });
        return Savings({assets,label:'OnExchange',AllocCon});
    }

    // Store the API keys if they change.
    async function keys() { 
    	safestore.ssUpdate(`${portfolio.key} ${portfolio.secret}`, false);
    }

    // pairs is the result of calling AssetPairs, so a series of properties
    //  like `PAIR: {altname, base, etc.}`. If you want more than just the
    // property name (the pair, or symbol used by Kraken for that market),
    // you have to pass 1 in as idx. You can pass undefined for quote.
    // TODO: make this function easier to use, like:
    //  findPair('XXBTZUSD', altname) -> 'XBTUSD'.
    function findPair(base, quote = 'ZUSD', idx = 0) {
        const p = Object.entries(pairs).find(a => a[1].altname===base 
            || a[0] === base || alts[base] === a[0]
            || (a[1].quote===quote && ([base,alts[base]].includes(a[1].base))));
        if(!p) {
            console.trace("No pair with base",base,"and quote",quote,
                "in pairs that has",Object.keys(pairs).length,"keys.");
            return '';
        }
        return idx === -1 ? p : p[idx];
    };

    // Save changes as they happen in encrypted storage.
    function save() {
        const toSave = {
            key: portfolio.key,
            secret: portfolio.secret,
            savings: portfolio.Savings,
            Alloc: portfolio.Allocation,
            Numeraire: portfolio.Numeraire || 'ZUSD',
            Pairs: Array.from(portfolio.Pairs),
	        Closed: portfolio.Closed,
            Extra,
            limits: portfolio.limits,
            lastUpdate: portfolio.lastUpdate};
        safestore.replace(toSave);
        console.log("Updated, saved to disk.",FLAGS.verbose ? toSave : '');
    }

    function showPair(p) {
        console.log("The pair",p,"is: ",pairs[p],
            "and pairs' length is:",Object.keys(pairs).length);
    }
    
    function pairInfo(p) {
        return pairs[p];
    }

    function sleep(ms) {
        return new Promise(resolve => {setTimeout(resolve, ms)});
    }

    // Call a Kraken API
    async function kapi(arg,sd=5) {
        let ret;
        const cached = tfc.isCached('kapi',arg);
        if( cached.answer && process.USECACHE ) {
            ret = cached.cached;
        } else if( process.USECACHE==='must' ) { return { result: { 
            descr: `No Cache for ${cached.id}` } }; 
        } else try {
            if(Array.isArray(arg)) {
                ret = await exchange.api(...arg);
            } else {
                ret = await exchange.api(arg);
            }
            await sleep(1000);
        } catch(err) {
            // For error conditions that are usually transient.
            if((!/AddOrder/.test(arg[0])&&/ETIMEDOUT|EAI_AGAIN/.test(err.code))
                || /nonce/.test(err.message)
                || /Response code 520/.test(err.message)
                || /Response code 50/.test(err.message)
                || (FLAGS.risky && /Internal error/.test(err.message))
                || /Unavailable/.test(err.message) 
                || /Rate limit|Throttled/.test(err.message)) {
                console.log(22,`${err.message}, so trying again in ${sd}s...(${new Date}):`);
                if(Array.isArray(arg)) {
                    // eslint-disable-next-line no-param-reassign
                    delete arg[1].nonce;
                    console.log(...arg);
                } else {
                    console.log(arg);
                }
                await sleep(sd*1000);
                ret = await kapi(arg,sd>300?sd:2*sd);
            // For error conditions that can be ignored.
            } else if( /Unknown order/.test(err.message) && /CancelOrder/.test(arg[0])) {
                console.log("Ignoring: ", err.message, ...arg);
                ret = { result: { descr: "Ignored" }};
            // For error conditions that can be retried later.
            } else if(FLAGS.risky && /Insufficient initial margin/.test(err.message)) {
                console.log(172,`${err.message} Maybe next time.`);
                ret = { result: { descr: "Postponed" }};
            } else {
		// console.log(174,"API key: ", portfolio.key);
                throw err;
            }
            await sleep(1000);
        }
        // if(FLAGS.verbose||!cached) console.log(ret);
        if(!cached || !cached.answer) tfc.store(cached.id,ret);
        return ret;
    }

    async function cachePairs() {
        console.log("Reading Asset Pairs...");
        const kp = await kapi('AssetPairs');
            const ret = {};
        Object.keys(kp.result).forEach(k => {
            ret[k] = kp.result[k];
            ret[k].pair = k;
            ret[kp.result[k].altname] = ret[k];
        });
        return ret;
    }

    async function cacheTickers() {
        console.log("Reading Tickers...");
        const kp = await kapi('Assets');
            const ret = Object.keys(kp.result);
        ret.forEach(t => {
            if(kp.result[t].altname !== t) alts[kp.result[t].altname] = t;
        });
        return ret;
    }

    // init initializes the bot and accepts a password for testing.
    async function init(pwd = "") { 
        if(!exchange) {
            safestore = ssModule(pwd);
            // eslint-disable-next-line no-param-reassign
            config.stored = safestore;
            const p = await safestore.read();
            Extra = p.Extra || Extra;
            exchange = new ExchClient(p.key, p.secret);
            pairs = await cachePairs();
            tickers = await cacheTickers();
            Savings.init(this);
            portfolio.key = p.key;
            portfolio.secret = p.secret;
            portfolio.Savings = p.savings ? p.savings : []; 
	        portfolio.Closed = p.Closed || {orders: {}, offset: 0};      // Must be something for new accounts.
            portfolio.Allocation = AllocCon(config, p.Alloc.assets);
            portfolio.Pairs = new Set(Array.isArray(p.Pairs) ? p.Pairs : []);
            portfolio.Tickers = new Set();
            portfolio.Numeraire = p.Numeraire || 'ZUSD';
            portfolio.limits = p.limits ? p.limits : [0,-1];
            portfolio.lastUpdate = p.lastUpdate ? p.lastUpdate : null;
            Reports = ReportCon(this);
        }
        return portfolio;
    };

    // return array of unique values for a property of Pair
    function fromPairs(what) {
        const qc=new Set;
        Object.keys(pairs).forEach(key => {
            qc.add(pairs[key][what]);
        });
        return Array.from(qc);
    }

    // Collect all the bases represented in Pairs.
    function basesFromPairs() {
        if(!Bases)
            Bases = fromPairs('base');
        return Bases;
    }

    // Collect all the numeraires represented in Pairs.
    function numerairesFromPairs() {
        if(!Numeraires)
            Numeraires = fromPairs('quote');
        return Numeraires;
    }

    // Create a user reference number.
    function makeUserRef(buysell, market, price) {
        const ret = Number((buysell==='buy'?'1':'0')
            + (`00${Object.keys(pairs)
                .indexOf(findPair(market,portfolio.Numeraire))}`).slice(-3)
            + String(`000000${price}`).replace('.','').slice(-6));
        if(FLAGS.verbose) console.log("Created userref ",ret);
        return ret;
    }

    // Place an order:
    //  buysell indicates whether this is a 'buy' or a 'sell'
    //  market identifies the pair for this trade.
    //  price specifies how much of the quote (what gets paid)
    //      we're willing to pay/receive for one of the base (what's bought or sold)
    //  amt is how much of the base we want to buy or sell
    // lev indicates the level of leverage
    // uref can be used to specify the userreference.
    // closeO is the price at which to close the trade profitably.
    async function order(buysell, market, price, amt, lev='none', inUref=0, closeO=null) {
        let cO = Number(closeO);
            const p = Number(price);
            const a = Number(amt);
            const qCost = p*a;
            let ret = '';
            let uref = inUref;
            const pairA = findPair(market,portfolio.Numeraire,-1);
            const pair = pairA[0];
            const pairO = pairA[1];
            const ticker = pairO.base;
            const {quote} = pairO;
            const nuFactor = portfolio[quote][1]; // Multiply to get value in Numeraire
            const maxInNum = portfolio.limits[1]; // This is 
            let d; const notTrade = (maxInNum !== -1 && (qCost*nuFactor>maxInNum) 
                || (qCost*nuFactor>25 && FLAGS.safe));

        if(pair === "undefined") 
            return `${market} is not yet supported.`;
        if(uref===0) uref = makeUserRef(buysell, market, price);
        if(pairO.ordermin > a || pairO.costmin > qCost) {
            console.log( `${a+ticker}@${p} is too small for the exchange.` );
            return {txid:"", uref};
        }
        if( cO === price ) cO = 0;

        console.log(`${(notTrade ? `(>$${maxInNum} not safe, so NOT) ` : '')
            +buysell}ing ${a} ${market} at ${p} with leverage ${lev
            }${cO===0 ? "" : ` to close at ${Number.isNaN(cO)?`${closeO} is NaN!`:cO}` } as ${uref}`);
        if( cO>0 && (buysell === 'buy' ? cO <= price : cO >= price) )
            throw new Error(`Close price, ${cO} is on the wrong side of ${buysell} at ${price}!`);
        if(process.argv[2]==='fakeTrade') // Just fake it
            return {txid:'AAAAA-1234-ZZZ',uref};
        ret = ['AddOrder',
            {   pair,
                userref:        uref,
                type:           buysell,
                ordertype:      'limit',
                price:          p,
                volume:         a,
                leverage:       lev,
                close:          (cO>0 ? {ordertype:'limit',price:cO} : null)
            }];
        if(!notTrade) {
            const response = await kapi(ret);
            d = response.result;
            if(d) { 
                ret = {txid:d.txid,uref};
                if(d.descr) {
                    console.log(40,response,d.descr); 
                } else {
                    console.log(40,response,'No result.descr from kapi');
                }
            } else console.log(40,response,"No kapi response.");
            console.log(42,"Cooling it for a second...");
            await sleep(1000);
        } else console.log(204,p*a*nuFactor,"is not in range:",portfolio.limits);
        if(notTrade) await sleep(5000);
        return ret;
    }

    // Return a string description of a grid point.
    function gpToStr(gp) { 
        return `${gp.userref}:${gp.buy}-${gp.sell} ${gp.bought}/${gp.sold}`; 
    }

    async function moreOrders(count = 100) {
        const pc = portfolio.Closed;
            const preOffset = pc.offset;
            const closed = await Reports.getExecuted(count, pc);
            const closedIDs = Object.keys(closed.orders);
        // Store closed orders in portfolio
        console.log("At offset",`${preOffset}... Now`, closedIDs.length, "orders.");
        if(preOffset < closed.offset || closed.offset === -1) {
            console.log(`(Re-?)Saving,${closedIDs.length},closed orders...`);
            portfolio.Closed = closed;
            save();
        }
        return closed;
    }
    // Initialize the grid by reading closed orders if necessary
    async function initGrid() {
        let gPrices = [];
        if(portfolio) {
            if(portfolio.G)
                gPrices = portfolio.G;
        }
        if(gPrices.length === 0) {   // When we have no grid prices, collect 100 orders.
            console.log("Reading grid from 100 closed orders...");
            const closed = await moreOrders(100);
                const closedIDs = Object.keys(closed.orders);
            if(closedIDs.length > 0) {
                lCOts = closed.orders[closedIDs.pop()].closetm;
                let counter = closedIDs.length-1;
                console.log("Last five executed orders:");
                Object.entries(closed.orders).forEach(([o,oo]) => {  // fill in the grid prices from existing orders.
                        const od = oo.descr;
                        const op = od.price;
                        const ur = oo.userref;
			            const cd = new Date(oo.closetm * 1000);
                    let gp = gPrices.find(x => x.userref===ur); // If we already saw this grid point.
	                if( counter < 6 ) {
                        console.log(o,ur,op,od.type,od.close,`${cd.getFullYear()}/${1+cd.getMonth()
                            }/${cd.getDate()}`,cd.getHours(),cd.getMinutes(),cd.getSeconds());
                    }
                    counter -= 1;
                    if(portfolio && portfolio.Pairs) {
                        const pair2Add = findPair(od.pair);
                        portfolio.Pairs.add(pair2Add);   // Which pairs are in open orders?
                    } 
                    if(ur>0) {
                        if(!gp) {
                            gp = {userref:ur,buy:'?',sell:'?', bought: 0, sold: 0};
                            gp[od.type] = op;
                            gp[(od.type==='buy') ? 'bought' : 'sold'] = Number(oo.vol_exec); // was rv ??
                            gPrices.push(gp);
                            if(FLAGS.verbose) 
                                console.log(gp.userref,`(${od.type})`,
                                    'buy:',gp.buy,'sell:',gp.sell);
                        } else {
                            gp[(od.type==='buy') ? 'bought' : 'sold'] += Number(oo.vol_exec); // was rv ??
                            gp[od.type] = op;
                        }
                    }
                });
            }
        }
        portfolio.G = gPrices;
    }

    // opens: Open orders collected from Kraken
    // oldRefs: The OrderIDs collected previously
    // This function:
    // * Build bSidesR (Refs - which UserRefs have both buys and sells)
    // * Build bSidesP (Pair - to find highest sell and lowest buy for each pair)
    // * Identify orders that are new and orders that are now gone
    // * Create an array of orders ("comps") resulting from conditional closes
    //  so that we can combine them into a new order with its own conditional close.
    // * Update how much of each asset remains available (not reserved for these
    //  open orders).
    // It returns [bSidesR, bSidesP, comps]
    // -----------------------------------------------------------------------------
    function processOpens(opens, oldRefs, isFresh) {
        const bSidesR = [];
            const bSidesP = [];
            const comps   = [];
            const opensA  = [];
            const pnum    = portfolio.Numeraire;
            const gPrices = portfolio.G;

        Object.entries(opens).forEach(([o,oo]) => {
            const od = oo.descr;
            const op = od.price;
            const rv = oo.vol-oo.vol_exec;
            const ur = oo.userref;

            if(ur > 0) {
                // thishSides record for userref
                // ----------------------------
                let bs = bSidesR.find(b => b.userref===ur);
                if(!bs) {
                    bs = {userref:ur,buy:false,sell:false,trades:0};
                    bSidesR.push(bs);
                }
                bs[od.type]=true;
                bs.trades += 1;

                // thishSides record for grid extension
                // -----------------------------------
                bs = bSidesP.find(b => b.pair===od.pair);
                if(!bs) {
                    bs = {
                        pair:   od.pair,
                        price:  op,
                        buy:    od.type==='buy',
                        sell:   od.type==='sell'
                    };
                    bSidesP.push(bs);
                } else if(!bs[od.type]) {
                    bs[od.type] = true;
                } else if(bs.buy !== bs.sell) {
                    // Set bs.price to the lowest if there are only sells (bs.sell is true),
                    // or the highest if there are only buys (bs.buy is true).
                    // If both, it won't matter.
                    // --------------------------------------------------
                    if((bs.buy && Number(bs.price) < Number(op))
                        || (bs.sell && Number(bs.price) > Number(op))) bs.price = op;
                }
            }

            // Record open trades
            // ------------------
            opensA.push([o,oo]);
            const ct = od.type==='buy'?'sell':'buy'; // Order's close is of opposite type.
            let cp = 0;     // Close Price
            // Record the opening price for use in the closing
            // order of the closing order into which we combine.
            // -------------------------------------------------
            if(od.close && ur>0) { // Externally added orders have userref=0
                [cp,] = /[0-9.]+$/.exec(od.close);
                let gp = gPrices.find(gprice => gprice.userref===ur);
                if(!gp) {
                    gp = {userref:ur,buy:'?',sell:'?', bought: 0, sold: 0};
                    gPrices.push(gp);
                    if(FLAGS.verbose) console.log(329,
                        gp.userref,`(${od.type})`,'buy:',gp.buy,'sell:',gp.sell);
                }
                gp[od.type] = op;
                gp[ct] = cp;
            }
            const gp = gPrices.find(gprice => gprice.userref===ur&&ur>0);
            cp = gp ? gp[ct] : '?';
            const {pair} = od;
            const ci = od.pair+od.price+od.type; // pair picks up externals
            if(FLAGS.verbose) console.log(`comps index: ${ci}`);
            if(!comps[ci]) {
                if(FLAGS.verbose) console.log("Creating ci for",o);
                comps[ci]={
                    total:          rv,
                    volume:         Number(oo.vol),
                    type:           od.type,
                    sym:            pair,
                    ctype:          ct,
                    lev:            od.leverage,
                    ids:            [o],
                    userref:        ur,
                    open:           cp,
                    price:          od.price,
                    hasClose:       Boolean(od.close)
                };
            } else {
                if(FLAGS.verbose) console.log("Adding",o);
                comps[ci].total+=rv;        // Volume for combined order.
                comps[ci].ids.push(o);
                comps[ci].volume += Number(oo.vol); // Volume for extended order.
                // If any of them are missing a close, combine them all
                // ----------------------------------------------------
                comps[ci].hasClose &&= Boolean(od.close);
                // Fix a comp created from an external order.
                // ------------------------------------------
                if(comps[ci].userref === 0) comps[ci].userref = ur;
            }
            if(!od.close) {
                console.log(154,`${od.order} (${ur}) had no close.`);
            }
            const orid = oldRefs.indexOf(o);   // Remove it from oldRefs because it isn't gone.  
            if((orid) > -1) {
                oldRefs.splice(orid, 1);
            } else {    // It wasn't in there, so it must be new.
                console.log(159, "New: ",o,opensA.length, od.order, oo.userref, cp);
                // if(FLAGS.verbose) console.log(160,oo);
            }

            if(portfolio && isFresh && od.leverage === "none") {
                if(od.type === "buy") {
                    if(/USD$/.test(od.pair)) { // Deplete our cash
                        portfolio[pnum][2] -= od.price*opens[o].vol;      // #USD Refactor and basePair()
                    } else if(/XBT$/.test(od.pair)) { // Deplete our BTC
                        portfolio.XXBT[0] -= od.price*opens[o].vol;
                    }
                } else {
                    // Deplete available crypto
                    // ------------------------
                    const p396 = findPair(od.pair,pnum,1);
// console.log({p396});
                    portfolio[p396.base][0] -= opens[o].vol;
                }
            }
        });
        portfolio.O = opensA;
        if(oldRefs.length > 0) {
            console.log(`Gone: ${oldRefs}`);
            // If trades are gone, check for freshly executed orders.
            moreOrders();
        }

        return [bSidesR, bSidesP, comps];
    }

    // How to cancel orders, either a TxID, an array of them,
    //  ALL of them (pass 0), or a line number from the list
    //  of orders, or all orders with a particular User
    //  Reference Number.
    async function kill(o,oa) {
        let killed;
        if(o === 0) {
            const killAll = prompt("Cancel ALL orders? [y/N]");
            if(/^y/i.test(killAll)) {
                killed = await kapi('CancelAll');
                console.log(314,killed);
            } else { console.log("Maybe be more careful."); }
            
        } else if(FLAGS.safe) {
            console.log(`In Safemode(!), so NOT killing ${o}`);
            
        } else if(Array.isArray(o) && o.length > 1) {
            console.log("Killing",o,'...');
            killed = await kapi(['CancelOrderBatch',{orders:o}]);
            console.log(546,killed);
        } else if(Array.isArray(o) && o.length > 0) {
            console.log("Killing",o[0],'...');
            killed = await kapi(['CancelOrder',{txid:o[0]}]);
            console.log(568,killed);
        } else if(typeof(o)==='string' && o.match(/-/)) {
            console.log(`Killing ${o}...`);
            killed = await kapi(['CancelOrder', {txid: o}]);
            console.log(320,killed);
        } else if(o < 100000) {
            const idxo = oa[o-1];
            console.log(`Killing ${idxo[0]}(described as ${idxo[1].descr.order}...`);
            killed = await kapi(['CancelOrder', {txid: idxo[0]}]);
            console.log(325,killed);
            idxo[0] = `Killed: ${ idxo[0]}`;
            idxo[1].descr.order = `Killed: ${idxo[1].descr.order}`;
        } else {
            console.log(`Killing userref ${o}...`);
            killed = await kapi(['CancelOrder', {txid: o}]);
            console.log(329,killed);
        }
    //    console.log(331,"Waiting a second.");
    //    await sleep(1000);
    }

    async function getPrice(tkr) { 
        if(portfolio[tkr]) return portfolio[tkr][1];
        if(Savings.pricers[tkr]) {
            const ret = await Savings.pricers[tkr].price(tkr);
            return toDec(ret, 2);
        }
        const pair = findPair(tkr,portfolio.Numeraire);
            const newPrice = pair ? await kapi(["Ticker",{pair}]) : false;
        if(newPrice) return Object.values(newPrice.result)[0].c[0];
        console.log( `No way to get price for ${tkr}` );
        return 0;
    }

    // howMuch is adapted from the code recently developed
    // for the client that shows how much to trade if the
    // price changes (to np = NewPrice).
    // ---------------------------------------------------
    async function howMuch(tkr, np) {
        const // tkr = findPair(mkt),
            p = await getPrice(tkr);
            const dp = (np - p)/p;    // % change in price
            const [,desired,adjust,ranges] = await portfolio.Allocation.Allocations();
            const t = portfolio.Allocation.getTotal();
            let [hp,lp] = ranges[tkr] || [0,0];
            const [b,ma] = (adjust[tkr] 
                ? adjust[tkr].split('+')
                : [desired[0],0]).map(Number);
            let f = Math.min(1,(hp - Math.min(hp,np))/(hp-lp));
            let tot1 = 0;   // How much of this crypto is off the Exchange?
            let ov = 0;     // What is the value of everything else?
            const tt = {};

        // If new price beyond range, adjust range, recalculate factor.
        if(np > hp || np < lp) {
            [hp,lp] = [hp,lp].map(x => x*(np/(np<lp?lp:hp)));
            f = Math.min(1,(hp - Math.min(hp,np))/(hp-lp));
        }
        Array.from(portfolio.Tickers)
            .forEach((pt)=>{tt[pt]=portfolio[pt];
        });
        portfolio.Savings.forEach((s) => { s.assets.forEach((aa) => {
            tot1 += aa.ticker===tkr?aa.amount:0;
            ov += [tkr,'ZUSD'].includes(aa.ticker)?0:aa.amount;
            });});
        Object.keys(tt).forEach((s) => {
            ov += [tkr,'ZUSD'].includes(s)
            ? 0
            : tt[s][3] * tt[s][1]; });
        const a = tot1 + tt[tkr][3];
        const t2 = t + (dp*(p*a + ov));
        const t2s = t + (dp*p*a);     // If other asset values are constant.
        const a2 = (b+ma*f) * t2/np;
console.log("[p,np,dp,t,hp,lp,b,ma,f,tot1,ov,a,a2,t2,t2s]:",
    [p,np,dp,t,hp,lp,b,ma,f,tot1,ov,a,a2,t2,t2s]);
        return a2 - a;
    }

    // getLev is NOT idempotent: It depletes availability.
    // ---------------------------------------------------
    function getLev(portfolio2,buysell,price,amt,market,posP) {
        let lev = 'none';
            const pnum = portfolio.Numeraire;
            const psym = findPair(market,pnum,1).base;
        if(buysell === 'buy') {
            if(1*price > 1*portfolio[psym][1] && posP)
                return `Buying ${market} @ ${price} isn't a limit order.`;
            if(price*amt > 1*portfolio[pnum][2]) { // #USD Refactor - This doesn't support leverage
                lev = '2';                           // on non-USD pairs. Hunt ZUSD and add basePair(pair) to get base.
            } else {
                portfolio[pnum][2] -= price*amt;   // #USD Refactor and basePair()
            }
        } else {
            if(price*1 < 1*portfolio[psym][1] && posP) return `Selling ${market} @ ${price} isn't a limit order.`;
            // console.log("We have "+portfolio[market][2]+" "+market);
            if(amt*1 > 1*portfolio[psym][2]) {
                lev = '2';
            } else {
                portfolio[psym][2] -= amt;
            }
            // console.log("Now we have "+portfolio[market][2]+" "+market);
        }
        if(FLAGS.verbose) console.log(`Leverage will be ${lev}`);
        return lev;
    }

    // We want extend() to update allocation for ranges
    // and thereby set the amount properly.
    // ------------------------------------------------
    async function listOpens(isFresh=false) {
        const response = await kapi('OpenOrders');
            const opens = response.result.open;
        let comps   = [];       // Orders resulting from partial executions
            let bSidesR = [];       // Which userrefs have both buys and sells.
            let bSidesP = [];       // Find highest sell and lowest buy for a pair.
            let bs; let pair; let sym; let price;
            // let ci; let oo; let od; let rv; let ur; let op; let cp; let gpi; let gp; let ct; 
            const pnum = portfolio.Numeraire;
            // Index for comps, Closing Price, index to grid prices,
            // and bs is "thish sides", holding an array of objects
            // holding userref, and two booleans, buy and sell.

        await initGrid(); // Also sets portfolio['G'] (the grid).
        const gPrices = portfolio.G;

        // Save the old order array so we can see the diff
        // -----------------------------------------------
        const oldRefs = [];
        if(portfolio && portfolio.O) {
            portfolio.O.forEach((x) => { oldRefs.push(x[0]); });
        }
        // With the list of open orders (opens) we will:
        // * Build bSidesR (Refs - which UserRefs have both buys and sells)
        // * Build bSidesP (Pair - to find highest sell and lowest buy for each pair)
        // * Identify orders that are new and orders that are now gone
        // * Create an array of orders ("comps") resulting from conditional closes
        //  so that we can combine them into a new order with its own conditional close.
        // * Update how much of each asset remains available (not reserved for these
        //  open orders).
        [bSidesR, bSidesP, comps] = processOpens(opens, oldRefs, isFresh);

        let nexes = 0; // Orders not requiring extension
        await Promise.all(Object.entries(comps).map(async ([comp,c]) => { 
            if(!/USD/.test(comp)) return; // non-USD pairs break regex below... #USD Refactor
            let gp = gPrices.find(gprice => gprice.userref===c.userref);
            bs = bSidesR.find(b => b.userref===c.userref);
            if(!gp) {
                gp = {userref:c.userref,buy:'?',sell:'?',bought:0,sold:0};
                gPrices.push(gp);
                console.log(gp.userref,`(${comp.slice(-4)})`,'buy:',gp.buy,'sell:',gp.sell);
            }
            gp[c.ctype] = c.open;
            gp[c.type]  = c.price;
            [,pair,price] = /([A-Z]+)([0-9.]+)/.exec(comp);
            sym = pairs[pair].base;
            if(FLAGS.verbose) console.log(`Checking: ${  c.type  } ${
                 sym  } ${  price  } ${  toDec(c.total,4)
                 }${c.open ? ` to ${c.ctype}-close @${c.open}` : '' } (${  c.userref  }):`);
            if(!Number.isNaN(c.open)) {
                if(!c.hasClose) { // If any doesn't have a close, combine them and add one.
                    console.log(421,Object.values(c.ids));
                    await kill(c.ids.length>1?c.ids:c.ids[0]);
                    await order(c.type,sym,price, toDec(c.total,4),
                       c.lev,c.userref,c.open);
                    if(FLAGS.verbose) console.log(425,
                        {buysell:c.type,sym,price,lev:c.lev,ur:c.userref,close:c.open});
                    // eslint-disable-next-line no-param-reassign
                    c.hasClose = true;
                    // Store the trades in gp
                    // ----------------------
                    const traded = c.type==='buy' ? 'sold' : 'bought';
                    gp[traded]+=c.total;
                }
                // Do we need to extend the grid?
                // If we don't have a buy and a sell, then yes.
                // --------------------------------------------
                bs = bSidesP.find(b => b.pair===c.sym); // Was sym+'USD' but #USD Refactor
                if(bs && bs.buy && bs.sell) {
                    // console.log("Still between buy and sell.");
                    nexes += 1;
                } else if(bs && bs.price===c.price) { // The lowest sell or highest buy
                    if(gp.sell - gp.buy <= 0) {
                        console.log("Somethig is wrong with this grid:\n",
                            JSON.stringify(gPrices));
                        return;
                    }
                    // Calculate price for missing side
                    // --------------------------------
                    const dp = gp.buy.indexOf('.');
                        const decimals=10**(dp > 0
                            ? gp.buy.length - dp - 1
                            : 0);
                        let ngp; let sp; let bp;
                    if(bs.buy) { // Missing the sell
                        do {
                            sp = Math.round(decimals*gp.sell*gp.sell/gp.buy)/decimals;
                            // eslint-disable-next-line no-param-reassign
                            c.userref = makeUserRef('sell', c.sym, sp);
                            // We may already have this grid price but the order
                            // was deleted, so search for it first.
                            ngp = gPrices.find(n => n.userref===c.userref);
                            if(!ngp) {
                                ngp = {userref:c.userref,
                                    buy:gp.sell,
                                    sell:String(sp),
                                    bought: 0, sold: 0};
                                gPrices.push(ngp);
                                console.log(ngp.userref,'(sell)',
                                    'buy:',ngp.buy,'sell:',ngp.sell);
                                console.log(249,`sell ${c.sym} ${sp} ${c.volume
                                    } to close at ${gp.sell}`);
                            }
                            // eslint-disable-next-line no-await-in-loop
                            const newVol = -1 * await howMuch(sym, sp);
                            if(newVol < 0) {
                                console.log("At",sp,"you'd have to 'sell'",
                                    `${newVol}, which means we're way out of balance.`);
                                return;
                            }
                            order('sell',c.sym,sp,newVol,
                                getLev(portfolio,'sell',sp,newVol,c.sym,false),c.userref,
                                gp.sell);
                            gp = ngp;
                       } while(sp <= 1*portfolio[findPair(c.sym,pnum,1).base][1]);
                    } else {
                        do {
                            bp = Math.round(decimals*gp.buy*gp.buy/gp.sell)/decimals;
                            // eslint-disable-next-line no-param-reassign
                            c.userref = makeUserRef('buy', c.sym, bp);
                            // We may already have this grid price but the order
                            // was deleted, so search for it first.
                            ngp = gPrices.find(n => n.userref===c.userref);
                            if(!ngp) {
                                ngp = {userref:c.userref,
                                    buy:String(bp),
                                    sell:gp.buy,
                                    bought: 0, sold: 0};
                                gPrices.push(ngp);
                                console.log(ngp.userref,'( buy)',
                                    'buy:',ngp.buy,'sell:',ngp.sell);
                                console.log(264,`buy ${c.sym} ${bp} ${c.volume
                                    } to close at ${gp.buy}`);
                                if(ngp.buy === ngp.sell) throw new Error("Bad Grid Point");
                            }
                            // eslint-disable-next-line no-await-in-loop
                            const newVol = await howMuch(sym, bp);
                            if(newVol < 0) {
                                console.log("At",bp,"you'd have to 'buy'",
                                `${newVol}, which means we're way out of balance.`);
                                return;
                            }
                            order('buy',c.sym,bp,newVol,
                                getLev(portfolio,'buy',bp,newVol,c.sym,false),c.userref,
                                gp.buy);
                            gp = ngp;
                        } while(bp >= 1*portfolio[findPair(c.sym,pnum,1).base][1])
                    }
                }
            }
        }));
        // console.log(gPrices);
        console.log(nexes,"orders did NOT require extension.");
        // console.log(comps);
    }

    // How to adjust the size of one or more trades.
    async function lessmore(less, oid, amt, all = null) {
        const opensA = portfolio.O;
            let matches = [];
            let newAmt; let partial; let sym; let cp; let lev;
        if(!opensA[oid]) {
            console.log(`Order ${oid} not found.`);
            return;
        } if(all) {
            // If all, then this order only identifies the crypto and the amount to match
            // --------------------------------------------------------------------------
            const [,o] = opensA[oid];
            matches = opensA.filter(oae => {
                const [,io] = oae;
                return io.descr.pair===o.descr.pair
                    && Math.round(o.vol*1000)===Math.round(io.vol*1000);
            });
        } else {
            matches.push(opensA[oid]);
        }
        const diff = (less ? -1 : 1);
        await Promise.all(Object.entries(matches).forEach(([oRef,o]) => {
            // If some has been executed, then we won't replace the old one.
            // The old one's original volume might be needed to extend the grid.
            // -----------------------------------------------------------------
            partial = o.vol_exec > 0;
            if(!/USD$/.test(o.descr.pair)) {  // #USD Refactor
                console.log("Size update to non-USD orders is not yet supported.");
                return;
            } if(partial && diff === -1) {
                console.log("Skipping",o.descr.order,"because of partial execution.",o);
            } else if(!o.descr.close) {
                console.log("Skipping",o.descr.order,"because it has no close.",o.descr);
            } else {
                [,sym] = /(.*)USD$/.exec(o.descr.pair);
                [cp,] = / [0-9.]+$/.exec(o.descr.close);
                lev = o.descr.leverage[0]==='n'?"none":'2';
                newAmt = Number(o.vol) + diff*Number(amt);
                if(newAmt < 0) {
                    console.log("Skipping",o.descr.order,"because amount would go negative.",o.descr);
                } else {
                    console.log("To: ",o.descr.type,sym,o.descr.price,newAmt,cp);
                    kill(oRef);
                    order(o.descr.type,sym,o.descr.price,newAmt,lev,o.userref,cp);
                }
            }
        }));
        if(FLAGS.verbose) console.log("Lessmore called with ",oid,amt,all);
    }

    async function marginReport(show = true) {
        const positions = await kapi(['OpenPositions',{consolidation:"market",ctr:60}]);
        const brief = [];
        if(Object.keys(positions.result).length) { try {
            positions.result.forEach( (pos) => { 
                let vol = (1*pos.vol-1*pos.vol_closed)*(pos.type==='sell' ? -1 : 1);
                    const pair = findPair(pos.pair,'',1);
                    const sym = pair.base;
                    const cost = Number(pos.cost);
                vol = toDec(vol,8);
                brief[sym] = {
                    open:       vol,
                    pair:        pos.pair,
                    cost,
                    margin:     pos.margin };
            });
            if(show) console.log(475,brief);
        } catch(e){console.trace(e,positions.result);} }
        return brief;
    }

    function w(n,x) { 
        const s = n.toString(); 
        return x>s.length 
            ? s+' '.repeat(x-s.length)
            : s; 
        }

    async function report(showBalance=true) {
        const balP = kapi('Balance'); 
            const tikP = kapi(['TradeBalance',{ctr:30}]); 
            const marP = marginReport(false);
            const [bal,trb,mar] = await Promise.all([balP,tikP,marP]); 
        portfolio.M = mar;
        portfolio.lastUpdate = new Date;
        Object.keys(bal.result).forEach(p => {
            if(p !== portfolio.Numeraire)
                portfolio.Pairs.add(findPair(p,portfolio.Numeraire)||'XXBTZUSD');
        });
        const tik = await kapi(['Ticker',{ pair : portfolio.Pairs.size > 0
            ? (Array.from(portfolio.Pairs)).sort().join().replace(/,,+|^,|,$/g,',') 
            : 'XXBTZUSD'}]);
        portfolio.Allocation.setRanges(tik.result);
        let price; let ts; const zeroes = []; const mCosts = [];
        // Sometimes the first request for balances lists a quote from
        // a margin position  after the position's crypto, and this
        // means portfolio[quote-symbol] doesn't yet exist, so we can't
        // adjust it to reflect the position.  We keep track of those
        // position costs in mCosts.
        // ------------------------------------------------------------
        Object.keys(bal.result).forEach( p => {
            const sym = p;
            const amt = toDec(bal.result[p],4); let q;
            if(p !== portfolio.Numeraire) {
                ts=findPair(p,portfolio.Numeraire);
            }    
            if(ts) {
                if(alts[ts]) ts = alts[ts];
                if(ts in tik.result) [price,] = tik.result[ts].c;
            } else {
                if(FLAGS.verbose) console.log("Using 1 as value of",p);
                price = 1;
            }
            price = toDec(price,(sym==='EOS'?4:2));
            portfolio[sym]=[amt,price,amt,amt];
            portfolio.Tickers.add(sym);
            // holdings w/reserves, price, holdings w/o reserves
            // [3] will include reserves and margin:
            if(mar[sym]) {
                portfolio[sym][0] = toDec(portfolio[sym][0]+mar[sym].open,4);
                portfolio[sym][3] = amt + Number(mar[sym].open);
                q = findPair(mar[sym].pair,'',1).quote;
                mCosts[q] =(mar[sym].open < 0 ? 1 : -1)*mar[sym].cost 
                    + (mCosts[q] || 0);
            }
            if(amt > 0 && showBalance) console.log(`${p}\t${w(portfolio[sym][0],16)}${price}`);
            else if(amt === 0) zeroes.push(p);
        });
        // A new account might not have any units of the numeraire.  Mine didn't.
        // The code relies on the existing balance to create the property in
        // the portfolio, so we do it manually if it isn't there yet.
        // ----------------------------------------------------------------------
        if(!portfolio[portfolio.Numeraire]) portfolio[portfolio.Numeraire] = [0,1,0,0];
        Object.entries(mCosts).forEach(sym => { 
            portfolio[sym][3] += mCosts[sym]; 
            if( Number.isNaN(mCosts[sym]) )
                throw new Error(`Problem with ${sym}, ${mCosts[sym]} in mCosts (895): `);
        });
        // The price of the numeraire is always 1
        // --------------------------------------
        portfolio[portfolio.Numeraire][1] = 1;
        if(showBalance) {
            console.log(`Cost\t${trb.result.c}`);
            console.log(`Value\t${trb.result.v}`);
            console.log(`P & L\t${trb.result.n}`);
            Object.keys(mar).forEach( s => {
                if(portfolio[s]) {
                    console.log(`${s}: ${portfolio[s][2]} outright, and ${mar[s].open} on margin.`);
                } else {
                    console.log(`Did not find ${s} in portfolio!`);
                }
            });
        }
        if(zeroes.length > 0 && showBalance) 
            console.log("0-unit assets skipped: ",zeroes.join(','));
        // console.log(portfolio);
        // showState();
        await listOpens(true);
    }

    // How to see a list of orders, open or closed.
    async function list(args) {
        if(args[1] === '?') {
            console.log("Usage: list [X] [ur]\n" +
                "X can be C or CR to see closed orders, and if so, then\n" +
                "ur can be a userref and only those trades will be listed.\n" +
                "If ur is less than 10000, it will tell the bot how many\n" +
                "closed orders to return. To collect early orders, use a\n" +
                "negative number. To ignore locally stored orders, use CR.\n" +
                "X can also be a ticker (UPPER CASE) to see orders for it.\n" +
                "Otherwise, X can be userref, opentm, vol, vol_exec, price,\n" +
                "or userref and this will cause the specified field to be\n" +
                "listed first, and the list to be ordered by that field.");
            return;
        }
        if(!portfolio.O) await report(false);
        const sortedA = []; let orders = portfolio.O;
        if( ['C','CR'].includes(args[1]) ) {
            if(args[1] === 'CR') {
                console.log("Restting closed orders record.");
                portfolio.Closed = {orders: {}, offset: 0};
                save();
            }
            let count = 50; 
                let ur = args[2] ? args.pop() : false;
                const early = ur < 0; 
            if(ur && !Number.isNaN(ur) && Number(ur) < 10000) {
                count = Math.abs(ur);
                ur = false;
            }
            orders = [];
            const closed = await moreOrders();
            (early ? closed.keysFwd() : closed.keysBkwd())
                .forEach((o) => {
                const oo = closed.orders[o];
                if(orders.length < count && (!ur || oo.userref===ur)) 
                    orders.push([o,oo]);
            });
            console.log("Orders.length:",orders.length,"Era:",
                early ? "Earliest" : "Latest");
            // Either way, we display the latest at the bottom by:
            if(!closed.forward) orders.reverse();
            args.pop();
        }
        orders.forEach((x,i) => {
            const ldo = x[1].descr.order;
            if(args.length===1 || RegExp(args[1]).test(ldo))
                console.log(`${x[0]} ${i+1} ${ldo} ${x[1].userref
                } ${x[1].status==='closed'
                    ? new Date(1000*x[1].closetm)
                    : x[1].descr.close}`);
            else if(x[1][args[1]]) sortedA[i+1]=x;
            else if(x[1].descr[args[1]]) sortedA[i+1]=x;
        });
        if(sortedA.length > 0) {
            sortedA.sort((a1,b1) => {
                let a; let b;
                if(a1[1].descr[args[1]]) {
                    a = a1[1].descr[args[1]];
                    b = b1[1].descr[args[1]];
                } else {
                    a = a1[1][args[1]];
                    b = b1[1][args[1]];
                }
                return Number.isNaN(a)
                    ? a.localeCompare(b)
                    : a - b;
            });
            console.log("Outputting sortedA...");
            sortedA.forEach((x,i) => {
                const ldo = x[1].descr.order;
                console.log(i+1, x[1].descr[args[1]]
                    ? x[1].descr[args[1]] : x[1][args[1]],
                    ldo,x[1].userref,x[1].descr.close);
            });
        };
        const isMore = portfolio.Closed.offset > -1;
        console.log("We have collected", isMore
            ? portfolio.Closed.offset : "all",
            "orders.", isMore ? "Try again for more." : "");
    }

    // How to recreate an order with the correct userref.
    async function refnum(opensA,oid,newRef) {
        if(!opensA[oid]) {
            console.log(`Order ${oid} not found.`);
            return;
        } 
        const [oRef,o] = opensA[oid];
        
        if(!/USD$/.test(o.descr.pair)) {
            console.log("Userref update to non-USD pairs is not yet supported.");
            return;
        }
        if(o.userref === 0) {
            const bs=o.descr.type;
                const sym=/^([A-Z]+)USD/.exec(o.descr.pair)[1];
                const p=o.descr.price;
                const amt=toDec(Number(o.vol) - Number(o.vol_exec),4);
                const lev=o.descr.leverage[0]==='n'?"none":'2';
            console.log(`Attempting ${bs} ${sym} ${p} ${amt} ${lev} ${newRef}...`);
            await kill(oid+1, opensA);
            await order(bs,sym,p,amt,lev,newRef);
        } else {
            console.log(`${oRef} already has userref ${o.userref}`);
        }
    }

    // How to alter an order so we don't borrow to execute it.
    async function deleverage(opensA,oid,undo=false) {
        let placed;
        if(!opensA[oid]) {
            console.log(`Order ${oid} not found.`);
            return;
        } 
        const [oRef,o] = opensA[oid];
        
        if(!/USD$/.test(o.descr.pair)) {
            console.log("Creating/deleveraging non-USD pairs is not yet supported.");
            return;
        }
        // eslint-disable-next-line no-bitwise
        if(undo ^ (o.descr.leverage === 'none')) {
            console.log(`${oRef} is ${ undo ? "already leveraged" : "not leveraged."}`);
            return;
        }
        if(!o.descr.close) {
        placed = await order(o.descr.type,/^([A-Z]+)USD/.exec(o.descr.pair)[1],
            o.descr.price,toDec(Number(o.vol) - Number(o.vol_exec),4),
            (undo ? '2' : 'none'),o.userref);
        } else {
        placed = await order(o.descr.type,/^([A-Z]+)USD/.exec(o.descr.pair)[1],
            o.descr.price,toDec(Number(o.vol) - Number(o.vol_exec),4),
            (undo ? '2' : 'none'),o.userref,
            /[0-9.]+$/.exec(o.descr.close)[0] );
        }
        if(placed.txid 
            && /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/.test(placed.txid)) { // Depends on Exchange's TxID
            await kill(oid+1, opensA);
        }
    }

    // How to set the price of a grid point
    async function set(p,ur,type,price) {
        if(ur && price) {
            let gp = p.G.find(g => g.userref===ur);
            if(!gp) {
                gp = {userref:Number(ur),buy:'?',sell:'?'};
                p.G.push(gp);
            }
            console.log(405,gp);
            gp[type] = price;
        }
        p.G.sort((a,b) => a.userref-b.userref);
        let profits = 0; let f; let data; let drc; let datad; let count = 0; let once = false;
            let since = lCOts; let haveAll = false;
            const closed = await moreOrders(50);
        // eslint-disable-next-line no-param-reassign
        p.Closed = closed;
        // If p.Closed.offset is -1, then we have
        //  collected all completed orders and we can search them
        //  for this Userref.
        if(p.Closed.offset === -1) {
            haveAll = true;
            once = false;   // We have everything, so we can update all grid points.
            if(!once) console.log("All orders have been retrieved.");
        }
        await Promise.all(p.G.map(async (x) => {
            since = new Date().getTime()/1000;
            f = toDec(((x.sell-x.buy)*Math.min(x.bought,x.sold)),2);
            if(!Number.isNaN(f) && (once || x.since)) profits += f;
            else if(!once && !x.open && x.userref !== 0) { // We do this once for each call to set
                           // and remember which grid points are in play so need to stay.
                if(!haveAll) {
                    once = true;
                    data = await kapi(['ClosedOrders',{userref:x.userref}]);
                    drc = data.result ? data.result.closed : false;
                    // For trades with a close price, we can search for and include
                    // any 'other' grid point that is only different because it
                    // started on the other side.
                    let closePrice; let aur; // Alternate UserRef
                    // eslint-disable-next-line no-param-reassign
                    x.bought = 0; x.sold = 0;
                    if(drc && Object.values(drc).length > 0) {
                        count = data.result.count;
                        // Check for a close and build alternate userRef
                        const {close} = Object.values(drc)[0].descr;
                        if(close) {
                            closePrice = Number(close.match(/[0-9.]+/)[0]);
                            aur = RegExp(`1?[0-9]{3}${String(closePrice).replace('.','')}`);
                            aur = p.G.find((x2) => aur.test(x2.userref) && x!==x2);
                            if(aur && aur.buy === x.buy) {
                                // eslint-disable-next-line no-param-reassign
                                x.aur = aur.userref;
                                aur.aur = x.userref;
                                const data2 = await kapi(['ClosedOrders',{userref:x.aur}]);
                                    const drc2 = data2.result ? data2.result.closed : {};
                                drc = Object.values(drc).concat(Object.values(drc2));
                                count += data2.result.count;
                            }
                        }
                    }
                    console.log("Retrieved",count,"closed orders for",`${x.userref  }.`);
                } else {    // p.Closed has ALL orders.
                    // Include orders if they are sells with a close at the buy
                    //  price or buys with a close at the sell price.
                    drc = Object.entries(p.Closed).filter((o) =>
                        (!o[0].includes('-') ? false :
                        ((Number(x.buy) === Number(o[1].descr.close.match(/[0-9.]+/)[0])
                                && o[1].descr.type === 'sell')
                            || (Number(x.sell) === Number(o[1].descr.close.match(/[0-9.]+/)[0])
                                && o[1].descr.type === 'buy'))));
                    if(FLAGS.verbose)
                        console.log(drc.length,"found from",x.buy,"to",x.sell,"for",x.userref, drc);
                }
                Object.keys(drc).forEach((d) => {
                    data = drc[d];
                    if(data.status === 'closed' 
                        && data.descr.ordertype !== 'settle-position') {
                        datad = data.descr;
                        since = Math.min(since,data.closetm);
                        // eslint-disable-next-line no-param-reassign
                        x.since = since;
                        // eslint-disable-next-line no-param-reassign
                        x[datad.type==='buy'?'bought':'sold'] += Number(data.vol_exec);
                        if(datad.close)
                        {
                            if(Number.isNaN(x.buy) || Number.isNaN(x.sell)) {
                                // eslint-disable-next-line no-param-reassign
                                x[datad.type] = data.price;
                                // eslint-disable-next-line no-param-reassign
                                x[datad.type==='buy'?'sell':'buy'] = 
                                    Number(datad.close.match(/[0-9.]+/)[0]);
                            }
                        }
                    }
                });
                f = toDec(((x.sell-x.buy)*Math.min(x.bought,x.sold)),2);
                data = p.O.find(o => o.userref===x.userref);
                // eslint-disable-next-line no-param-reassign
                x.open = (data !== undefined);
                if(!Number.isNaN(f)) profits += f;   // Profits from just-retrieved trades.
            }
            const s2 = (new Date((x.since>1?x.since:since)*1000)).toLocaleString();
            console.log(`${x.userref}: ${x.buy}-${x.sell
                 }${(x.bought+x.sold)>0
                    ? (`, bought ${toDec(x.bought,2)
                        } and sold ${toDec(x.sold,2)} for ${  f
                        } since ${  s2}`)
                    : ''}`);
        }));
        console.log(`That's ${toDec(profits,2)} altogether.`);
    }

    // The bot's job is to make roundtrips.  This function reports them.
    // This does not address capital gains because it doesn't take into
    // account the cost basis.
    function roundTrips() {}

    function showState(prefix = '') {
        const ret = `${prefix + (FLAGS.risky?'R':'.') + (FLAGS.safe?'S':'.')
             } at ${  new Date}`;
        console.log(ret);
        return ret;
    }

        // eslint-disable-next-line no-param-reassign
        config.bot = {order, set, listOpens, deleverage, w, ExchangeSavings,
        refnum, list, kapi, lessmore, kill, report, howMuch,
        sleep, marginReport, getLev, showState, getExtra,
        pairInfo, showPair, FLAGS, save, basesFromPairs, findPair,
        numerairesFromPairs, init, keys, getPrice, tfc,
        getPairs, getTickers, getAlts, getPortfolio, getConfig};

        return config.bot;
}