#!/usr/bin/env node
const Manager = require('./manager.js');
function Bot(isExch = {exch: 'kraka-djs'}) {
    const prompt = require('prompt-sync')({sigint: true});
    const Allocation = require('./allocation.js');
    const ExchClient = require(isExch.exch); // Implements the Kraken API
    Bot.pairs = false;
    Bot.tickers = false;
    Bot.alts = {};

    let exchange,           // The ExchClient from kraka-djs
        portfolio = {},     // A record of what's on the exchange
        lCOts = 0,          // Timestamp for use in collecting executed trades.
        FLAGS = {safe:true,verbose:process.TESTING,risky:false},
        safestore,          // encrypted sorage
        Savings,            // Client's assets
        Reports;            // Report functionality

    // init initializes the bot and accepts a password for testing.
    async function init(pwd = "") { 
        if(!exchange) {
            let p = await (safestore = require('./safestore')(pwd)).read();
            //p.
if(FLAGS.verbose) console.log(p);
            Bot.s = this;
	    Bot.PW = safestore.getPW();             // Recorded for use in webpage.
            Bot.extra = p.extra ? p.extra : {};
            exchange = new ExchClient(p.key, p.secret);
            Bot.pairs = await cachePairs();
            Bot.tickers = await cacheTickers();
            portfolio.key = p.key;
            portfolio.secret = p.secret;
            portfolio.Savings = p.savings ? p.savings : []; 
	    portfolio.Closed = p.Closed || {orders: {}, offset: 0};      // Must be something for new accounts.
            portfolio.Allocation = Allocation(
                (p.Alloc && (0<Object.keys(p.Alloc).length)) ? p.Alloc : false); 
//console.trace(portfolio.Allocation.toString());
            portfolio.Pairs = new Set(Array.isArray(p.Pairs) ? p.Pairs : []);
            portfolio.Tickers = new Set();
            portfolio.Numeraire = p.Numeraire || 'ZUSD';
            portfolio.limits = p.limits ? p.limits : [0,-1];
            portfolio.lastUpdate = p.lastUpdate ? p.lastUpdate : null;
            //await report(true);
//console.log("Requiring Savings...");
            Savings = require('./savings.js');
            Reports = require('./reports.js')(this);
        }
        return portfolio;
    };

    // Returns a Savings object which includes assets on the exchange.
    function ExchangeSavings() {
        let assets = [];
        for(key in portfolio) {
            if(Bot.tickers.includes(key)
                && Array.isArray(portfolio[key])
                && portfolio[key].length == 4
                && portfolio[key][3] != 0) {
                assets.push({ticker:key,amount:toDec(portfolio[key][3],4)});
            }
        }
        return Savings({assets,label:'OnExchange'});
    }

    // Store the API keys if they change.
    async function keys() { 
    	safestore._update(portfolio.key+' '+portfolio.secret, false);
    }

    // Save changes as they happen in encrypted storage.
    function save(extra = null) {
        if(extra) Object.assign(Bot.extra, extra);
        let toSave = {
            key: portfolio.key,
            secret: portfolio.secret,
            savings: portfolio.Savings,
            Alloc: portfolio.Allocation,
            Numeraire: portfolio.Numeraire || 'ZUSD',
            Pairs: Array.from(portfolio.Pairs),
	    Closed: portfolio.Closed,
            extra: Bot.extra,
            limits: portfolio.limits,
            lastUpdate: portfolio.lastUpdate};
        safestore.replace(toSave);
        console.log("Updated, saved to disk.",FLAGS.verbose ? toSave : '');
    }

    function showPair(p) {
        console.log("The pair",p,"is: ",Bot.pairs[p],
            "and pairs' length is:",Object.keys(Bot.pairs).length);
    }
    
    function pairInfo(p) {
        return Bot.pairs[p];
    }

    async function cachePairs() {
        console.log("Reading Asset Pairs...");
        let kp = await kapi('AssetPairs'),
            ret = {};
        Object.keys(kp.result).forEach(k => {
            ret[k] = kp.result[k];
            ret[k].pair = k;
            ret[kp.result[k].altname] = ret[k];
        });
        return ret;
    }

    async function cacheTickers() {
        console.log("Reading Tickers...");
        let kp = await kapi('Assets'),
            ret = Object.keys(kp.result),
            alts = [];
        ret.forEach(t => {
            if(kp.result[t].altname != t) Bot.alts[kp.result[t].altname] = t;
        });
        return ret;
    }

    // return array of unique values for a property of Pair
    function fromPairs(what) {
        let qc=new Set;
        for(key in Bot.pairs) {
            qc.add(Bot.pairs[key][what]);
        }
        return Array.from(qc);
    }

    // Collect all the bases represented in Pairs.
    function basesFromPairs() {
        if(!Bot.Bases)
            Bot.Bases = fromPairs('base');
        return Bot.Bases;
    }

    // Collect all the numeraires represented in Pairs.
    function numerairesFromPairs() {
        if(!Bot.Numeraires)
            Bot.Numeraires = fromPairs('quote');
        return Bot.Numeraires;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function whoami() { return whoami.caller.name; }

    const tfc = require('./testFasterCache.js')(process.TESTING,process.argv[2]);

    // Call a Kraken API
    async function kapi(arg,sd=5) {
        let ret;
        if(['args',whoami()].includes(process.TESTING)) console.log(whoami(),"called with ",arguments);
        let cached = tfc.isCached('kapi',arg);
        if( cached.answer && process.USECACHE ) {
            ret = cached.cached;
        } else if( process.USECACHE=='must' ) { ret = { result: { descr: "No Cache." } }; 
        } else try { // Because failure is not an option here, sometimes.
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
                console.log(22,err.message+", so trying again in "+sd+"s...("+(new Date)+"):");
                if(Array.isArray(arg)) {
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
                console.log(172,err.message+" Maybe next time.");
                ret = { result: { descr: "Postponed" }};
            } else {
		//console.log(174,"API key: ", portfolio.key);
                throw err;
            }
            await sleep(1000);
        }
        // if(FLAGS.verbose||!cached) console.log(ret);
        if(!cached || !cached.answer) tfc.store(cached.id,ret);
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
    async function order(buysell, market, price, amt, lev='none', uref=0, closeO=null) {
        if(['args',whoami()].includes(process.TESTING)) console.log(whoami(),"called with ",arguments);
        let cO = Number(closeO),
            p = Number(price),
            a = Number(amt),
            qCost = p*a,
            ret = '',
            pairA = Bot.findPair(market,portfolio.Numeraire,-1),
            pair = pairA[0],
            pairO = pairA[1],
            ticker = pairO.base,
            quote = pairO.quote,
            nuFactor = portfolio[quote][1], // Multiply to get value in Numeraire
            maxInNum = portfolio.limits[1], // This is 
            d,notTrade = (maxInNum != -1 && (qCost*nuFactor>maxInNum) 
                || (qCost*nuFactor>25 && FLAGS.safe));

        if("undefined" == pair) 
            return market+" is not yet supported.";
        if(uref==0) uref = makeUserRef(buysell, market, price);
        if(pairO.ordermin > a || pairO.costmin > qCost) {
            console.log( a+ticker+'@'+p+" is too small for the exchange." );
            return {txid:"", uref};
        }
        if( cO == price ) cO = 0;

        console.log(27,(notTrade ? '(>$'+maxInNum+' not safe, so NOT) ' : '')
            +buysell+"ing "+a+" "+market+" at "+p+" with leverage "+lev
            +(cO==0 ? "" : " to close at "+(isNaN(cO)?closeO+' is NaN!':cO)) +" as "+uref);
        if( cO>0 && (buysell == 'buy' ? cO <= price : cO >= price) )
            throw 'Close price, '+cO+' is on the wrong side of '+buysell+' at '+price+'!';
        if(process.argv[2]=='fakeTrade') // Just fake it
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
            let response = await kapi(ret);
            console.log(40,response 
                ? ((d = response.result)
                    ? (ret = {txid:d.txid,uref:uref},d.descr) 
                    : 'No result.descr from kapi') 
                : "No kapi response.");
            console.log(42,"Cooling it for a second...");
            await sleep(1000);
        } else console.log(204,p*a*nuFactor,"is not in range:",portfolio.limits);
        if(notTrade) await sleep(5000);
        return ret;
    }

    // Return a string description of a grid point.
    function gpToStr(gp) { 
        return gp.userref+':'+gp.buy+'-'+gp.sell+' '+gp.bought+'/'+gp.sold; 
    }

    // Create a user reference number.
    function makeUserRef(buysell, market, price) {
        let ret = Number((buysell=='buy'?'1':'0')
            + ('00'+Object.keys(Bot.pairs)
                .indexOf(Bot.findPair(market,portfolio.Numeraire))).slice(-3)
            + String('000000'+price).replace('.','').slice(-6));
        if(FLAGS.verbose) console.log("Created userref ",ret);
        return ret;
    }

    async function moreOrders(count = 100) {
        let pc = portfolio.Closed,
            preCount = Object.keys(pc.orders || {}).length,
            closed = await Reports.getExecuted(count, pc),
            closedIDs = Object.keys(closed.orders);
        // Store closed orders in portfolio
        console.log((Array.isArray(pc.orders)?"Array":"Object"),
            "had",preCount,"orders and now has",closedIDs.length, "orders.");
        if(preCount < closedIDs.length) { // || closed.offset == -1) {
            console.log("(Re-?)Saving,"+closedIDs.length+",closed orders...");
            portfolio.Closed = closed;
            save();
        }
        return closed;
    }
    // Initialize the grid by reading closed orders if necessary
    async function initGrid() {
        let gPrices = [];
        if(portfolio) {
            if(portfolio['G'])
                gPrices = portfolio['G'];
        }
        if(gPrices.length == 0) {   // When we have no grid prices, collect 100 orders.
            console.log("Reading grid from 100 closed orders...");
            let closed = await moreOrders(),
                closedIDs = Object.keys(closed.orders);
            if(closedIDs.length > 0) {
                lCOts = closed.orders[closedIDs.pop()].closetm;
                let counter = closedIDs.length;
                console.log("Last five executed orders:");
                for(var o of closed.orders) {  // fill in the grid prices from existing orders.
                    let oo = closed.orders[o], // Object version of the order
                        od = oo.descr,
                        op = od.price,
                        rv = oo.vol-oo.vol_exec,    // Remaining Volume.
                        ur = oo.userref,
			cd = new Date(oo.closetm * 1000);
                        gp = gPrices.find(x => x.userref==ur); // If we already saw this grid point.
	            if( --counter < 6 ) {
                        console.log(o,ur,op,od.type,od.close,cd.getFullYear()+'/'+(1+cd.getMonth())
                            +'/'+cd.getDate(),cd.getHours(),cd.getMinutes(),cd.getSeconds());
                    }
                    if(portfolio && !portfolio.Pairs) {
                        portfolio.Pairs.add(od.pair);   // Which pairs are in open orders?
                    } 
                    if(ur>0) {
                        if(!gp) {
                            gp = {userref:ur,buy:'?',sell:'?', bought: 0, sold: 0};
                            gp[od.type] = op;
                            gp[(od.type=='buy') ? 'bought' : 'sold'] = Number(oo.vol_exec); // was rv ??
                            gPrices.push(gp);
                            if(FLAGS.verbose) 
                                console.log(gp.userref,'('+od.type+')',
                                    'buy:',gp.buy,'sell:',gp.sell);
                        } else {
                            gp[(od.type=='buy') ? 'bought' : 'sold'] += Number(oo.vol_exec); // was rv ??
                            gp[od.type] = op;
                        }
                    }
                }
            }
        }
        portfolio['G'] = gPrices;
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
        let bSidesR = [],
            bSidesP = [],
            comps   = [],
            opensA  = [],
            pnum    = portfolio.Numeraire,
            gPrices = portfolio['G'];

        for( var o in opens ) {
            oo = opens[o];
            od = oo.descr;
            op = od.price;
            rv = oo.vol-oo.vol_exec;
            ur = oo.userref;

            if(ur > 0) {
                // BothSides record for userref
                // ----------------------------
                bs = bSidesR.find(b => b.userref==ur);
                if(!bs) {
                    bs = {userref:ur,buy:false,sell:false,trades:0};
                    bSidesR.push(bs);
                }
                bs[od.type]=true;
                bs.trades++;

                // BothSides record for grid extension
                // -----------------------------------
                bs = bSidesP.find(b => b.pair==od.pair);
                if(!bs) {
                    bs = {
                        pair:   od.pair,
                        price:  op,
                        buy:    od.type=='buy',
                        sell:   od.type=='sell'
                    };
                    bSidesP.push(bs);
                } else if(!bs[od.type]) {
                    bs[od.type] = true;
                } else if(bs.buy != bs.sell) {
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
            ct = 'buy'==od.type?'sell':'buy'; // Order's close is of opposite type.
            cp = 0;     // Close Price
            // Record the opening price for use in the closing
            // order of the closing order into which we combine.
            // -------------------------------------------------
            if(od.close && ur>0) { // Externally added orders have userref=0
                cp = /[0-9.]+$/.exec(od.close)[0];
                gp = gPrices.find(gprice => gprice.userref==ur);
                if(!gp) {
                    gp = {userref:ur,buy:'?',sell:'?', bought: 0, sold: 0};
                    gPrices.push(gp);
                    if(FLAGS.verbose) console.log(329,
                        gp.userref,'('+od.type+')','buy:',gp.buy,'sell:',gp.sell);
                }
                gp[od.type] = op;
                gp[ct] = cp;
            }
            gp = gPrices.find(gprice => gprice.userref==ur&&ur>0);
            cp = gp ? gp[ct] : '?';
            pair = od.pair;
            ci = od.pair+od.price+od.type; // pair picks up externals
            if(FLAGS.verbose) console.log("comps index: "+ci);
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
                if(0 == comps[ci].userref) comps[ci].userref = ur;
            }
            if(!Boolean(od.close)) {
                console.log(154,od.order+" ("+ur+") had no close.");
            }
            let orid;   // Remove it from oldRefs because it isn't gone.  
            if((orid = oldRefs.indexOf(o)) > -1) {
                oldRefs.splice(orid, 1);
            } else {    // It wasn't in there, so it must be new.
                console.log(159, "New: ",o,opensA.length, od.order, oo.userref, cp);
                // if(FLAGS.verbose) console.log(160,oo);
            }

            if(portfolio && isFresh && od.leverage == "none") {
                if(od.type == "buy") {
                    if(/USD$/.test(od.pair)) { // Deplete our cash
                        portfolio[pnum][2] -= od.price*opens[o].vol;      // #USD Refactor and basePair()
                    } else if(/XBT$/.test(od.pair)) { // Deplete our BTC
                        portfolio['XXBT'][0] -= od.price*opens[o].vol;
                    }
                } else {
                    // Deplete available crypto
                    // ------------------------
                    let p396 = Bot.findPair(od.pair,pnum,1);
// console.log({p396});
                    portfolio[p396.base][0] -= opens[o].vol;
                }
            }
        }
        portfolio['O'] = opensA;
        if(oldRefs.length > 0) {
            console.log("Gone: "+oldRefs);
        }

        return [bSidesR, bSidesP, comps];
    }

    // We want extend() to update allocation for ranges
    // and thereby set the amount properly.
    // ------------------------------------------------
    async function listOpens(isFresh=false) {
        let response = await kapi('OpenOrders'),
            opens = response.result.open;
        let comps   = [],       //Orders resulting from partial executions
            bSidesR = [],       //Which userrefs have both buys and sells.
            bSidesP = [],       //Find highest sell and lowest buy for a pair.
            ci,oo,od,rv,ur,op,cp,gpi,gp,ct,bs,pair,sym,price,pnum;
            // Index for comps, Closing Price, index to grid prices,
            // and bs is "Both sides", holding an array of objects
            // holding userref, and two booleans, buy and sell.

        await initGrid(); // Also sets portfolio['G'] (the grid).
        let gPrices = portfolio['G'];
        pnum = portfolio.Numeraire;

        // Save the old order array so we can see the diff
        // -----------------------------------------------
        let oldRefs = [];
        if(portfolio && portfolio['O']) {
            portfolio['O'].forEach((x) => { oldRefs.push(x[0]); });
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

        let nexes = 0, // Orders not requiring extension
            dontask = false;
        for( var comp in comps ) if(/USD/.test(comp)) { // non-USD pairs break regex below... #USD Refactor
            let c = comps[comp],
            gp = gPrices.find(gprice => gprice.userref==c.userref);
            bs = bSidesR.find(b => b.userref==c.userref);
            if(!gp) {
                gp = {userref:c.userref,buy:'?',sell:'?',bought:0,sold:0};
                gPrices.push(gp);
                console.log(gp.userref,'('+comp.slice(-4)+')','buy:',gp.buy,'sell:',gp.sell);
            }
            gp[c.ctype] = c.open;
            gp[c.type]  = c.price;
            [,pair,price] = /([A-Z]+)([0-9.]+)/.exec(comp);
            sym = Bot.pairs[pair].base;
            if(FLAGS.verbose) console.log("Checking: " + c.type + ' '
                + sym + ' ' + price + ' ' + toDec(c.total,4)
                + (c.open ? ' to '+c.ctype+'-close @'+c.open : '') +' (' + c.userref + "):");
            if(!isNaN(c.open)) {
                if(!c.hasClose) { // If any doesn't have a close, combine them and add one.
                    console.log(421,Object.values(c.ids));
                    await kill(c.ids.length>1?c.ids:c.ids[0]);
                    await order(c.type,sym,price, toDec(c.total,4),
                       c.lev,c.userref,c.open);
                    if(FLAGS.verbose) console.log(425,
                        {buysell:c.type,sym,price,lev:c.lev,ur:c.userref,close:c.open});
                    c.hasClose = true;
                    // Store the trades in gp
                    // ----------------------
                    let traded = c.type=='buy' ? 'sold' : 'bought';
                    gp[traded]+=c.total;
                }
                // Do we need to extend the grid?
                // If we don't have a buy and a sell, then yes.
                // --------------------------------------------
                bs = bSidesP.find(b => b.pair==c.sym); // Was sym+'USD' but #USD Refactor
                if(bs && bs.buy && bs.sell) {
                    // console.log("Still between buy and sell.");
                    ++nexes;
                } else if(bs && bs.price==c.price) { // The lowest sell or highest buy
                    if(gp.sell - gp.buy <= 0) {
                        console.log("Somethig is wrong with this grid:\n",
                            JSON.stringify(gPrices));
                        return;
                    }
                    // Calculate price for missing side
                    // --------------------------------
                    let dp = gp.buy.indexOf('.'),
                        decimals=Math.pow(10,dp > 0
                            ? gp.buy.length - dp - 1
                            : 0),
                        ngp,sp,bp;
                    if(bs.buy) { // Missing the sell
                        do {
                            sp = Math.round(decimals*gp.sell*gp.sell/gp.buy)/decimals;
                            c.userref = makeUserRef('sell', c.sym, sp);
                            // We may already have this grid price but the order
                            // was deleted, so search for it first.
                            ngp = gPrices.find(n => n.userref==c.userref);
                            if(!ngp) {
                                ngp = {userref:c.userref,
                                    buy:gp.sell,
                                    sell:String(sp),
                                    bought: 0, sold: 0};
                                gPrices.push(ngp);
                                console.log(ngp.userref,'(sell)',
                                    'buy:',ngp.buy,'sell:',ngp.sell);
                                console.log(249,"sell "+c.sym+' '+sp+' '+c.volume
                                    +" to close at "+gp.sell);
                            }
                            let newVol = -1 * await howMuch(sym, sp);
                            if(newVol < 0) return console.log("At",sp,"you'd have to 'sell'",
                                newVol+", which means we're way out of balance.");
                            await order('sell',c.sym,sp,newVol,
                                getLev(portfolio,'sell',sp,newVol,c.sym,false),c.userref,
                                gp.sell);
                            gp = ngp;
                       } while(sp <= 1*portfolio[Bot.findPair(c.sym,pnum,1).base][1]);
                    } else {
                        do {
                            bp = Math.round(decimals*gp.buy*gp.buy/gp.sell)/decimals;
                            c.userref = makeUserRef('buy', c.sym, bp);
                            // We may already have this grid price but the order
                            // was deleted, so search for it first.
                            ngp = gPrices.find(n => n.userref==c.userref);
                            if(!ngp) {
                                ngp = {userref:c.userref,
                                    buy:String(bp),
                                    sell:gp.buy,
                                    bought: 0, sold: 0};
                                gPrices.push(ngp);
                                console.log(ngp.userref,'( buy)',
                                    'buy:',ngp.buy,'sell:',ngp.sell);
                                console.log(264,"buy "+c.sym+" "+bp+' '+c.volume
                                    +" to close at "+gp.buy);
                                if(ngp.buy == ngp.sell) throw "Bad Grid Point";
                            }
                            let newVol = await howMuch(sym, bp);
                            if(newVol < 0) return console.log("At",bp,"you'd have to 'buy'",
                                newVol+", which means we're way out of balance.");
                            await order('buy',c.sym,bp,newVol,
                                getLev(portfolio,'buy',bp,newVol,c.sym,false),c.userref,
                                gp.buy);
                            gp = ngp;
                        } while(bp >= 1*portfolio[Bot.findPair(c.sym,pnum,1).base][1])
                    }
                }
            }
        }
        // console.log(gPrices);
        console.log(nexes,"orders did NOT require extension.");
        // console.log(comps);
    }

    // howMuch is adapted from the code recently developed
    // for the client that shows how much to trade if the
    // price changes (to np = NewPrice).
    // ---------------------------------------------------
    async function howMuch(tkr, np) {
        let // tkr = Bot.findPair(mkt),
            p = await getPrice(tkr),
            dp = (np - p)/p,    // % change in price
            [current,desired,adjust,ranges] = await portfolio.Allocation.Allocations(),
            t = Manager.s.getTotal(),
            [hp,lp] = ranges[tkr] || [0,0],
            [b,ma] = (adjust[tkr] 
                ? adjust[tkr].split('+')
                : [desired[0],0]).map(Number),
            f = Math.min(1,(hp - Math.min(hp,np))/(hp-lp)),
            tot1 = 0,   // How much of this crypto is off the Exchange?
            ov = 0,     // What is the value of everything else?
            tt = {},
            a, t2, t2s, trade;

        // If new price beyond range, adjust range, recalculate factor.
        if(np > hp || np < lp) {
            [hp,lp] = [hp,lp].map(x => x*(np/(np<lp?lp:hp)));
            f = Math.min(1,(hp - Math.min(hp,np))/(hp-lp));
        }
        Array.from(portfolio.Tickers)
            .forEach((t)=>{tt[t]=portfolio[t];
        });
        portfolio.Savings.forEach((s) => { s.assets.forEach((a) => {
            tot1 += a.ticker==tkr?a.amount:0;
            ov += [tkr,'ZUSD'].includes(a.ticker)?0:a.amount;
            });});
        Object.keys(tt).forEach((s) => {
            ov += [tkr,'ZUSD'].includes(s)
            ? 0
            : tt[s][3] * tt[s][1]; });
        a = tot1 + tt[tkr][3];
        t2 = t + (dp*(p*a + ov));
        t2s = t + (dp*p*a);     // If other asset values are constant.
        a2 = (b+ma*f) * t2/np;
//console.log("[p,np,dp,t,hp,lp,b,ma,f,tot1,ov,a,a2,t2,t2s]:",
//    [p,np,dp,t,hp,lp,b,ma,f,tot1,ov,a,a2,t2,t2s]);
        return a2 - a;
    }

    // getLev is NOT idempotent: It depletes availability.
    // ---------------------------------------------------
    function getLev(portfolio,buysell,price,amt,market,posP) {
        let lev = 'none',
            pnum = portfolio.Numeraire,
            psym = Bot.findPair(market,pnum,1).base;
        if(buysell == 'buy') {
            if(1*price > 1*portfolio[psym][1] && posP)
                return "Buying "+market+" @ "+price+" isn't a limit order.";
            if(price*amt > 1*portfolio[pnum][2]) { // #USD Refactor - This doesn't support leverage
                lev = '2';                           // on non-USD pairs. Hunt ZUSD and add basePair(pair) to get base.
            } else {
                portfolio[pnum][2] -= price*amt;   // #USD Refactor and basePair()
            }
        } else {
            if(price*1 < 1*portfolio[psym][1] && posP) return "Selling "+market+" @ "+price+" isn't a limit order.";
            //console.log("We have "+portfolio[market][2]+" "+market);
            if(amt*1 > 1*portfolio[psym][2]) {
                lev = '2';
            } else {
                portfolio[psym][2] -= amt;
            }
            //console.log("Now we have "+portfolio[market][2]+" "+market);
        }
        if(FLAGS.verbose) console.log("Leverage will be "+lev);
        return lev;
    }

    // How to cancel orders, either a TxID, an array of them,
    //  ALL of them (pass 0), or a line number from the list
    //  of orders, or all orders with a particular User
    //  Reference Number.
    async function kill(o,oa) {
        let killed;
        if(0 == o) {
            const killAll = prompt("Cancel ALL orders? [y/N]");
            if(/^y/i.test(killAll)) {
                let killed = await kapi('CancelAll');
                console.log(314,killed);
            } else { console.log("Maybe be more careful."); }
            return;
        } else if(FLAGS.safe) {
            console.log("In Safemode(!), so NOT killing "+o);
            return;
        } else if(Array.isArray(o) && o.length > 1) {
            console.log("Killing",o,'...');
            killed = await kapi(['CancelOrderBatch',{orders:o}]);
            console.log(546,killed);
        } else if(Array.isArray(o) && o.length > 0) {
            console.log("Killing",o[0],'...');
            killed = await kapi(['CancelOrder',{txid:o[0]}]);
            console.log(568,killed);
        } else if('string'==typeof(o) && o.match(/-/)) {
            console.log("Killing "+o+"...");
            killed = await kapi(['CancelOrder', {txid: o}]);
            console.log(320,killed);
        } else if(o < 100000) {
            let idxo = oa[o-1];
            console.log("Killing "+idxo[0]+"(described as "+idxo[1].descr.order+"...");
            killed = await kapi(['CancelOrder', {txid: idxo[0]}]);
            console.log(325,killed);
            idxo[0] = 'Killed: '+ idxo[0];
            idxo[1].descr.order = 'Killed: '+idxo[1].descr.order;
        } else {
            console.log("Killing userref "+o+"...");
            killed = await kapi(['CancelOrder', {txid: o}]);
            console.log(329,killed);
        }
    //    console.log(331,"Waiting a second.");
    //    await sleep(1000);
    }

    // How to adjust the size of one or more trades.
    async function lessmore(less, oid, amt, all = null) {
        let opensA = portfolio['O'],
            matches = [],
            oRef, o, diff, newAmt, partial, sym, cp, lev;
        if(!opensA[oid]) {
            console.log("Order "+oid+" not found.");
            return;
        } else if(all) {
            // If all, then this order only identifies the crypto and the amount to match
            // --------------------------------------------------------------------------
            [oRef,o] = opensA[oid];
            matches = opensA.filter(oae => {
                [ioRef,io] = oae;
                return io.descr.pair==o.descr.pair
                    && Math.round(o.vol*1000)==Math.round(io.vol*1000);
            });
        } else {
            matches.push(opensA[oid]);
        }
        diff = (less ? -1 : 1);
        for (i in matches) {
            [oRef,o] = matches[i];
            // If some has been executed, then we won't replace the old one.
            // The old one's original volume might be needed to extend the grid.
            // -----------------------------------------------------------------
            partial = o.vol_exec > 0;
            if(!/USD$/.test(o.descr.pair)) {  // #USD Refactor
                console.log("Size update to non-USD orders is not yet supported.");
                return;
            } else if(partial && diff == -1) {
                console.log("Skipping",o.descr.order,"because of partial execution.",o);
            } else if(!o.descr.close) {
                console.log("Skipping",o.descr.order,"because it has no close.",o.descr);
            } else {
                sym = /(.*)USD$/.exec(o.descr.pair)[1];
                cp = / [0-9.]+$/.exec(o.descr.close)[0];
                lev = o.descr.leverage[0]=='n'?"none":'2';
                newAmt = Number(o.vol) + diff*Number(amt);
                if(newAmt < 0) {
                    console.log("Skipping",o.descr.order,"because amount would go negative.",o.descr);
                } else {
                    console.log("To: ",o.descr.type,sym,o.descr.price,newAmt,cp);
                    await kill(oRef);
                    await order(o.descr.type,sym,o.descr.price,newAmt,lev,o.userref,cp);
                }
            }
        };
        if(FLAGS.verbose) console.log("Lessmore called with ",oid,amt,all);
    }

    // How to see a list of orders, open or closed.
    async function list(args) {
        if(args[1] == '?') {
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
        let sortedA = [], orders = portfolio['O'];
        if( ['C','CR'].includes(args[1]) ) {
            if(args[1] == 'CR') {
                console.log("Restting closed orders record.");
                portfolio.Closed = {orders: {}, offset: 0};
                save();
            }
            let count = 50, 
                paging = 0, 
                ur = args[2] ? args.pop() : false,
                early = ur < 0; 
            if(ur && !isNaN(ur) && ur < 10000) {
                count = Math.abs(ur);
                ur = false;
            }
            orders = [];
            let closed = await moreOrders();
            closed.forward = early;
            portfolio.Closed = closed;
            for( var o of closed.orders) {
                let oo = closed.orders[o];
                if(!ur || oo.userref==ur) orders.push([o,oo]);
                if(orders.length >= count) break;
            }
            console.log("Orders.length:",orders.length,"Era:",
                early ? "Earliest" : "Latest");
            // Either way, we display the latest at the bottom by:
            if(!closed.forward) orders.reverse();
            args.pop();
        }
        orders.forEach((x,i) => {
            let ldo = x[1].descr.order;
            if(args.length==1 || RegExp(args[1]).test(ldo))
                console.log(x[0],i+1,ldo,x[1].userref,x[1].status=='closed'
                    ? new Date(1000*x[1].closetm)
                    : x[1].descr.close);
            else if(x[1][args[1]]) sortedA[i+1]=x;
            else if(x[1].descr[args[1]]) sortedA[i+1]=x;
        });
        if(sortedA.length > 0) {
            sortedA.sort((a,b) => {
                if(a[1].descr[args[1]]) {
                    a = a[1].descr[args[1]];
                    b = b[1].descr[args[1]];
                } else {
                    a = a[1][args[1]];
                    b = b[1][args[1]];
                }
                return isNaN(a)
                    ? a.localeCompare(b)
                    : a - b;
            });
            console.log("Outputting sortedA...");
            sortedA.forEach((x,i) => {
                let ldo = x[1].descr.order;
                console.log(i+1, x[1].descr[args[1]]
                    ? x[1].descr[args[1]] : x[1][args[1]],
                    ldo,x[1].userref,x[1].descr.close);
            });
        };
        let isMore = portfolio.Closed.offset > -1;
        console.log("We have collected", isMore
            ? portfolio.Closed.offset : "all",
            "orders.", isMore ? "Try again for more." : "");
    }

    // How to recreate an order with the correct userref.
    async function refnum(opensA,oid,newRef) {
        let o, oRef;
        if(!opensA[oid]) {
            console.log("Order "+oid+" not found.");
            return;
        } else {
            [oRef,o] = opensA[oid];
        }
        if(!/USD$/.test(o.descr.pair)) {
            console.log("Userref update to non-USD pairs is not yet supported.");
            return;
        }
        if(o.userref == 0) {
            let bs=o.descr.type,
                sym=/^([A-Z]+)USD/.exec(o.descr.pair)[1],
                p=o.descr.price,
                amt=toDec(Number(o.vol) - Number(o.vol_exec),4),
                lev=o.descr.leverage[0]=='n'?"none":'2';
            console.log("Attempting "+bs+' '+sym+' '+p+' '+amt+' '+lev+' '+newRef+"...");
            await kill(oid+1, opensA);
            await order(bs,sym,p,amt,lev,newRef);
        } else {
            console.log(oRef+" already has userref "+o.userref);
        }
    }

    // How to alter an order so we don't borrow to execute it.
    async function deleverage(opensA,oid,undo=false) {
        let o, oRef, placed;
        if(!opensA[oid]) {
            console.log("Order "+oid+" not found.");
            return;
        } else {
            [oRef,o] = opensA[oid];
        }
        if(!/USD$/.test(o.descr.pair)) {
            console.log("Creating/deleveraging non-USD pairs is not yet supported.");
            return;
        }
        if(undo ^ (o.descr.leverage == 'none')) {
            console.log(oRef+" is "+ (undo ? "already leveraged" : "not leveraged."));
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
            let gp = p['G'].find(g => g.userref==ur);
            if(!gp) {
                gp = {userref:Number(ur),buy:'?',sell:'?'};
                p['G'].push(gp);
            }
            console.log(405,gp);
            gp[type] = price;
        }
        p['G'].sort((a,b) => a.userref-b.userref);
        let profits = 0, f, data, drc, datad, count = 0, once = false,
            since = lCOts, haveAll = false,
            closed = await moreOrders(50);
        p.Closed = closed;
        // If p.Closed.offset is -1, then we have
        //  collected all completed orders and we can search them
        //  for this Userref.
        if(p.Closed.offset == -1) {
            haveAll = true;
            once = false;   // We have everything, so we can update all grid points.
            if(!once) console.log("All orders have been retrieved.");
        }
        await Promise.all(p['G'].map(async (x,xin) => {
            since = new Date().getTime()/1000;
            f = toDec(((x.sell-x.buy)*Math.min(x.bought,x.sold)),2);
            if(!isNaN(f) && (once || x.since)) profits += f;
            else if(!once && !x.open && x.userref != 0) { // We do this once for each call to set
                           // and remember which grid points are in play so need to stay.
                if(!haveAll) {
                    once = true;
                    data = await kapi(['ClosedOrders',{userref:x.userref}]);
                    drc = data.result ? data.result.closed : false;
                    // For trades with a close price, we can search for and include
                    // any 'other' grid point that is only different because it
                    // started on the other side.
                    let closePrice, aur; // Alternate UserRef
                    x.bought = 0; x.sold = 0;
                    if(drc && Object.values(drc).length > 0) {
                        count = data.result.count;
                        // Check for a close and build alternate userRef
                        let close = Object.values(drc)[0].descr.close;
                        if(close) {
                            closePrice = Number(close.match(/[0-9.]+/)[0]);
                            aur = RegExp('1?[0-9]{3}'+String(closePrice).replace('.',''));
                            aur = p['G'].find((x2) => aur.test(x2.userref) && x!=x2);
                            if(aur && aur.buy == x.buy) {
                                x.aur = aur.userref;
                                aur.aur = x.userref;
                                let data2 = await kapi(['ClosedOrders',{userref:x.aur}]),
                                    drc2 = data2.result ? data2.result.closed : {};
                                drc = Object.values(drc).concat(Object.values(drc2));
                                count += data2.result.count;
                            }
                        }
                    }
                    console.log("Retrieved",count,"closed orders for",x.userref + ".");
                } else {    // p.Closed has ALL orders.
                    // Include orders if they are sells with a close at the buy
                    //  price or buys with a close at the sell price.
                    drc = Object.entries(p.Closed).filter((o) =>
                        (!o[0].includes('-') ? false :
                        ((Number(x.buy) == Number(o[1].descr.close.match(/[0-9.]+/)[0])
                                && o[1].descr.type == 'sell')
                            || (Number(x.sell) == Number(o[1].descr.close.match(/[0-9.]+/)[0])
                                && o[1].descr.type == 'buy'))));
                    if(FLAGS.verbose)
                        console.log(drc.length,"found from",x.buy,"to",x.sell,"for",x.userref, drc);
                }
                for(d in drc) {
                    data = drc[d];
                    if(data.status == 'closed' 
                        && data.descr.ordertype != 'settle-position') {
                        datad = data.descr;
                        since = Math.min(since,data.closetm);
                        x.since = since;
                        x[datad.type=='buy'?'bought':'sold'] += Number(data.vol_exec);
                        if(datad.close)
                        {
                            closePrice = Number(datad.close.match(/[0-9.]+/)[0]);
                            if(isNaN(x.buy) || isNaN(x.sell)) {
                                x[datad.type] = data.price;
                                x[datad.type=='buy'?'sell':'buy'] = closePrice;
                            }
                        }
                    }
                }
                f = toDec(((x.sell-x.buy)*Math.min(x.bought,x.sold)),2);
                data = p['O'].find(o => {return o.userref==x.userref;});
                x.open = (data !== undefined);
                if(!isNaN(f)) profits += f;   // Profits from just-retrieved trades.
            }
            let s2 = (new Date((x.since>1?x.since:since)*1000)).toLocaleString();
            console.log(x.userref+': '+x.buy+'-'+x.sell
                + ((x.bought+x.sold)>0
                    ? (", bought "+toDec(x.bought,2)
                        +" and sold "+toDec(x.sold,2)+' for ' + f
                        +" since " + s2)
                    : '' ));
        }));
        console.log("That's "+toDec(profits,2)+" altogether.");
    }

    // The bot's job is to make roundtrips.  This function reports them.
    // This does not address capital gains because it doesn't take into
    // account the cost basis.
    function roundTrips() {}

    function toDec(n,places) {
        let f = 10**places;
        return Math.round(n*f)/f;
    }

    async function report(showBalance=true) {
        let balP = kapi('Balance'), 
            tikP = kapi(['TradeBalance',{ctr:30}]), 
            marP = marginReport(false),
            [bal,trb,mar] = await Promise.all([balP,tikP,marP]); 
        portfolio['M'] = mar;
        portfolio.lastUpdate = new Date;
        for( const p in bal.result) {
            if(p != portfolio.Numeraire)
                portfolio.Pairs.add(Bot.findPair(p,portfolio.Numeraire)||'XXBTZUSD');
        }
        let tik = await kapi(['Ticker',{ pair : portfolio.Pairs.size > 0
            ? (Array.from(portfolio.Pairs)).sort().join().replace(/,,+|^,|,$/g,',') 
            : 'XXBTZUSD'}]);
        portfolio.Allocation.setRanges(tik.result);
        let price, ts, zeroes = [], mCosts = [];
        // Sometimes the first request for balances lists a quote from
        // a margin position  after the position's crypto, and this
        // means portfolio[quote-symbol] doesn't yet exist, so we can't
        // adjust it to reflect the position.  We keep track of those
        // position costs in mCosts.
        // ------------------------------------------------------------
        for( const p in bal.result ) {
            let sym = p,
                amt = toDec(bal.result[p],4),q;
            if(p != portfolio.Numeraire && (ts=Bot.findPair(p,portfolio.Numeraire))) {
                if(Bot.alts[ts]) ts = Bot.alts[ts];
                if(ts in tik.result) price = tik.result[ts].c[0];
            } else {
                if(FLAGS.verbose) console.log("Using 1 as value of",p);
                price = 1;
            }
            price = toDec(price,(sym=='EOS'?4:2));
            portfolio[sym]=[amt,price,amt,amt];
            portfolio.Tickers.add(sym);
            // holdings w/reserves, price, holdings w/o reserves
            // [3] will include reserves and margin:
            if(mar[sym]) {
                portfolio[sym][0] = toDec(portfolio[sym][0]+mar[sym].open,4);
                portfolio[sym][3] = amt + Number(mar[sym].open);
                q = Bot.findPair(mar[sym].pair,'',1).quote;
                mCosts[q] =(mar[sym].open < 0 ? 1 : -1)*mar[sym].cost 
                    + (mCosts[q] || 0);
            }
            if(amt > 0 && showBalance) console.log(p+"\t"+w(portfolio[sym][0],16)+price);
            else if(amt == 0) zeroes.push(p);
        }
        // A new account might not have any units of the numeraire.  Mine didn't.
        // The code relies on the existing balance to create the property in
        // the portfolio, so we do it manually if it isn't there yet.
        // ----------------------------------------------------------------------
        if(!portfolio[portfolio.Numeraire]) portfolio[portfolio.Numeraire] = [0,1,0,0];
        for(sym in mCosts) { 
            portfolio[sym][3] += mCosts[sym]; 
            if( isNaN(mCosts[sym]) )
                throw "Problem with "+sym+", "+mCosts[sym]+" in mCosts (895): ";
        }
        // The price of the numeraire is always 1
        // --------------------------------------
        portfolio[portfolio.Numeraire][1] = 1;
        if(showBalance) {
            console.log("Cost\t"+trb.result['c']);
            console.log("Value\t"+trb.result['v']);
            console.log("P & L\t"+trb.result['n']);
            for( const s in mar ) {
                if(portfolio[s]) {
                    console.log(s+": "+portfolio[s][2]+" outright, and "+mar[s].open+" on margin.");
                } else {
                    console.log("Did not find "+s+" in portfolio!");
                }
            }
        }
        if(zeroes.length > 0 && showBalance) 
            console.log("0-unit assets skipped: ",zeroes.join(','));
        //console.log(portfolio);
        //showState();
        await listOpens(true);
    }

    function w(n,x) { 
        let s = n.toString(); 
        return x>s.length 
            ? s+' '.repeat(x-s.length)
            : s; 
        }

    async function marginReport(show = true) {
        let positions = await kapi(['OpenPositions',{consolidation:"market",ctr:60}]);
        let brief = [];
        if(Object.keys(positions.result).length) {
            positions.result.forEach( (pos) => {
                let vol = (1*pos.vol-1*pos.vol_closed)*(pos.type=='sell' ? -1 : 1),
                    pair = Bot.findPair(pos.pair,'',1),
                    sym = pair.base,
                    cost = Number(pos.cost);
                vol = toDec(vol,8);
                brief[sym] = {
                    open:       vol,
                    pair:        pos.pair,
                    cost:       cost,
                    margin:     pos.margin };
            });
            if(show) console.log(475,brief);
        }
        return brief;
    }

    function showState(prefix = '') {
        let ret = prefix + (FLAGS.risky?'R':'.') + (FLAGS.safe?'S':'.')
            + ' at ' + new Date;
        console.log(ret);
        return ret;
    }

    async function getPrice(tkr) { 
        if(portfolio[tkr]) return portfolio[tkr][1];
        if(Savings.pricers[tkr]) {
            let ret = await Savings.pricers[tkr].price(tkr);
            return toDec(ret, 2);
        }
        let pair = Bot.findPair(tkr,portfolio.Numeraire),
            newPrice = pair ? await kapi(["Ticker",{pair: pair}]) : false;
        if(newPrice) return Object.values(newPrice.result)[0].c[0];
        console.log( 'No way to get price for '+tkr );
        return 0;
    }

    return({order, set, listOpens, deleverage, w, ExchangeSavings,
        refnum, list, kapi, lessmore, kill, report, howMuch,
        sleep, marginReport, portfolio, getLev, showState,
        pairInfo, showPair, FLAGS, save, basesFromPairs,
        numerairesFromPairs, init, keys, getPrice, tfc});
}

// Bot.pairs is the result of calling AssetPairs, so a series of properties
//  like `PAIR: {altname, base, etc.}`. If you want more than just the
// property name (the pair, or symbol used by Kraken for that market),
// you have to pass 1 in as idx. You can pass undefined for quote.
// TODO: make this function easier to use, like:
//  findPair('XXBTZUSD', altname) -> 'XBTUSD'.
Bot.findPair = (base, quote = 'ZUSD', idx = 0) => {
    if(['args','findPair'].includes(process.TESTING))
        console.log('findPair',"called with ",{base, quote, idx});
    let p = Object.entries(Bot.pairs).find(a => {
        return a[1].altname==base || a[0] == base || Bot.alts[base] == a[0]
            || (a[1].quote==quote && ([base,Bot.alts[base]].includes(a[1].base)));
        });
    if(!p) {
        console.trace("No pair with base",base,"and quote",quote,
            "in Bot.pairs that has",Object.keys(Bot.pairs).length,"keys.");
        return '';
    }
    return idx == -1 ? p : p[idx];
};

module.exports = Bot;
