#!/usr/bin/env node
const fs = require('fs');
const prompt = require('prompt-sync')({sigint: true});

let homeDir = process.env.APPDATA
        || (process.platform == 'darwin'
            ? process.env.HOME + '/Library/Preferences'
            : process.env.HOME + "/.local/share"),
    keyFile = homeDir+'/keys.txt';

if(!fs.existsSync(keyFile)) {
    const key = prompt("Enter your API key: ");
    const secret = prompt('Enter your API secret: ');
    fs.writeFileSync(keyFile,key+' '+secret);
}

const myKeys       = fs.readFileSync(keyFile,{encoding:'utf8', flag:'r'});
const [key,secret] = myKeys.split(' ');
const KrakenClient = require('kraka-djs');
const kraken       = new KrakenClient(key, secret);
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function kapi(arg,sd=5)
{
    // await sleep(100);
    let ret;
    try { // Because failure is not an option here, sometimes.
        if(Array.isArray(arg)) {
            ret = await kraken.api(...arg);
        } else {
            ret = await kraken.api(arg);
        }
    } catch(err) {
        if((!/AddOrder/.test(arg[0])&&/ETIMEDOUT|EAI_AGAIN/.test(err.code))
            || /nonce/.test(err.message)
            || /Response code 50/.test(err.message)
            || (risky && /Internal error/.test(err.message))
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
        } else if( /Unknown order/.test(err.message) && /CancelOrder/.test(arg[0])) {
            console.log("Ignoring: ", err.message, ...arg);
            ret = { result: { descr: "Ignored" }};
        } else {
            catcher(26,err);
            ret = { result: { descr: err }};
        }
    }
    if(verbose) console.log(ret);
    return ret;
}

async function order(buysell, xmrbtc, price, amt, lev='none', uref=0, closeO=null) {
    let cO = Number(closeO),
        p = Number(price),
        a = Number(amt),
        ret = '';

    if(!RegExp('^('+USDPairs.join('|')+')$').test(xmrbtc+'USD')) return xmrbtc+" is not yet supported.";
    if( cO == price ) cO = 0;
    if(uref==0) uref = makeUserRef(buysell, xmrbtc, price);

    console.log(27,(safeMode ? '(Safe mode, so NOT) ' : '')
        +buysell+"ing "+a+" "+xmrbtc+" at "+p+" with leverage "+lev
        +(cO==0 ? "" : " to close at "+(isNaN(cO)?closeO+' is NaN!':cO)) +" as "+uref);
    if( cO>0 && (buysell == 'buy' ? cO <= price : cO >= price) )
		throw 'Close price, '+cO+' is on the wrong side of '+buysell+' at '+price+'!';
    ret = ['AddOrder',
        {   pair:           xmrbtc+'USD', // Just call it 'pair' so it already has the USD at the end! #USD Refactor
            userref:        uref,
            type:           buysell,
            ordertype:      'limit',
            price:          p,
            volume:         a,
            leverage:       lev,
            close:          (cO>0 ? {ordertype:'limit',price:cO} : null)
        }];
    if(!safeMode) {
        let response = await kapi(ret);
        console.log(40,response ? ((d = response.result)
            ? (ret = d.txid,d.descr) : 'No result.descr from kapi') : "No kapi response.");
        console.log(42,"Cooling it for a second...");
        await sleep(1000);
    }
    return ret;
}

function gpToStr(gp) { return gp.userref+':'+gp.buy+'-'+gp.sell+' '+gp.bought+'/'+gp.sold; }

function makeUserRef(buysell, xmrbtc, price) {
    let ret = Number((buysell=='buy'?'1':'2')
        + ('00'+USDPairs.indexOf(xmrbtc+'USD')).slice(-2)
        + String('000000'+price).replace('.','').slice(-7));
    if(verbose) console.log("Created userref ",ret);
    return ret;
}

async function listOpens(portfolio = null, isFresh=false) {
    let response = await kapi('OpenOrders'),
        opens = response.result.open;
    let opensA  = [],
        comps   = [],
        gPrices = [],
        bSides  = [],
        ci,oo,od,rv,n=0,ur,op,cp,gpi,gp,ct,bs;
        // Index for comps, n?, Closing Price, index to grid prices,
        // and bs is "Both sides", holding an array of objects
        // holding userref, and two booleans, buy and sell.
    if(portfolio&&portfolio['G']) gPrices = portfolio['G'];
    if(gPrices.length == 0) {
        let response = await kapi('ClosedOrders'),
            r2 = await kapi(['ClosedOrders',{ofs:50}]),
            r3 = await kapi(['ClosedOrders',{ofs:100}]),
            closed = {...response.result.closed, ...r2.result.closed, ...r3.result.closed };
        if(closed) {
            ts150 = closed[Object.keys(closed).pop()].closetm;
            for(o in closed) {
                let oo = closed[o],
                    od = oo.descr,
                    op = od.price,
                    rv = oo.vol-oo.vol_exec,
                    ur = oo.userref;
                    gp = gPrices.find(x => x.userref==ur);
                if(ur>0) {
                    if(!gp) {
                        gp = {userref:ur,buy:'?',sell:'?', bought: 0, sold: 0};
                        gp[od.type] = op;
                        gp[(od.type=='buy') ? 'bought' : 'sold'] = Number(rv);
                        gPrices.push(gp);
                        if(verbose) console.log(gp.userref,'('+od.type+')','buy:',gp.buy,'sell:',gp.sell);
                    } else {
                        gp[(od.type=='buy') ? 'bought' : 'sold'] += Number(rv);
                        gp[od.type] = op;
                    }
                }
            }
        }
    }

    // Save the old order array so we can see the diff
    // -----------------------------------------------
    let oldRefs = [];
    if(portfolio && portfolio['O']) {
        portfolio['O'].forEach((x) => { oldRefs.push(x[0]); });
    }
    for( o in opens ) {
        oo = opens[o];
        od = oo.descr;
        op = od.price;
        rv = oo.vol-oo.vol_exec;
        ur = oo.userref;

        if(ur > 0) {
            // BothSides record for userref
            // ----------------------------
            bs = bSides.find(b => b.userref==ur);
            if(!bs) {
                bs = {userref:ur,buy:false,sell:false,trades:0};
                bSides.push(bs);
            }
            bs[od.type]=true;
            bs.trades++;

            // BothSides record for grid extension
            // -----------------------------------
            bs = bSides.find(b => b.userref==od.pair);
            if(!bs) {
                bs = {
                    userref:od.pair,
                    price:  op,
                    buy:    od.type=='buy',
                    sell:   od.type=='sell'
                };
                bSides.push(bs);
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
        ct = 'buy'==od.type?'sell':'buy';
        cp = 0;
        // Record the opening price for use in the closing
        // order of the closing order into which we combine.
        // -------------------------------------------------
        if(od.close && ur>0) { // Externally added orders have userref=0
            cp = /[0-9.]+$/.exec(od.close)[0];
            gp = gPrices.find(gprice => gprice.userref==ur);
            if(!gp) {
                gp = {userref:ur,buy:'?',sell:'?', bought: 0, sold: 0};
                gPrices.push(gp);
                if(verbose) console.log(gp.userref,'('+od.type+')','buy:',gp.buy,'sell:',gp.sell);
            }
            gp[od.type] = op;
            gp[ct] = cp;
        }
        gp = gPrices.find(gprice => gprice.userref==ur&&ur>0);
        cp = gp ? gp[ct] : '?';
        if(++n == 0) {
            console.log(125, opens[o]);
        }

        ci = od.pair+od.price+od.type; // pair picks up externals
        if(verbose) console.log("comps index: "+ci);
        if(!comps[ci]) {
            comps[ci]={
                total:          rv,
                volume:         Number(oo.vol),
                type:           od.type,
                sym:            /USD/.test(od.pair) ? /^([A-Z]+)USD/.exec(od.pair)[1] : od.pair,
                // Just call it 'pair' instad of sym and use od.pair! #USD Refactor
                ctype:          ct,
                lev:            od.leverage,
                ids:            [o],
                userref:        ur,
                open:           cp,
                price:          od.price,
                hasClose:       Boolean(od.close)
            };
        } else {
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
            cli.apl++;
        }
        let orid;
        if((orid = oldRefs.indexOf(o)) > -1) {
            oldRefs.splice(orid, 1);
        } else {
            console.log(159, "New: ",o,opensA.length, od.order, oo.userref, cp);
            if(verbose) console.log(160,oo);
        }

        if(portfolio && isFresh && od.leverage == "none") {
            if(od.type == "buy") {
                if(/USD$/.test(od.pair)) { // Deplete our cash
                    portfolio['ZUSD'][2] -= od.price*opens[o].vol;      // #USD Refactor and basePair()
                } else if(/XBT$/.test(od.pair)) { // Deplete our BTC
                    portfolio['XBT'][0] -= od.price*opens[o].vol;
                }
            } else {
                // Deplete available crypto
                // ------------------------
                portfolio[od.pair.slice(0,-3)][0] -= opens[o].vol;
            }
        }
    }
    if(oldRefs.length > 0) {
        console.log("Gone: "+oldRefs);
    }

    let nexes = 0, // Orders not requiring extension
        dontask = false;
    for( comp in comps ) if(/USD/.test(comp)) { // non-USD pairs break regex below... #USD Refactor
        let c = comps[comp],
        gp = gPrices.find(gprice => gprice.userref==c.userref);
        bs = bSides.find(b => b.userref==c.userref);
        if(!gp) {
            gp = {userref:c.userref,buy:'?',sell:'?',bought:0,sold:0};
            gPrices.push(gp);
            console.log(gp.userref,'('+comp.slice(-4)+')','buy:',gp.buy,'sell:',gp.sell);
        }
        gp[c.ctype] = c.open;
        gp[c.type]  = c.price;
        [,sym,price] = /([A-Z]+)USD([0-9.]+)/.exec(comp); //remove USD #USD Refactor
        if(verbose) console.log("Checking: " + c.type + ' '
            + sym + ' ' + price + ' ' + Math.round(c.total*10000)/10000
            + (c.open ? ' to '+c.ctype+'-close @'+c.open : '') +' (' + c.userref + "):");
        if(!isNaN(c.open)) {
            if(!c.hasClose) { // If any doesn't have a close, combine them and add one.
                console.log(Object.values(c.ids));
                for(const id of c.ids) { await kill(id,null); }
                await order(c.type,sym,price, Math.round(c.total*10000)/10000,
                   c.lev,c.userref,c.open);
                c.hasClose = true;
                // Store the trades in gp
                // ----------------------
                let traded = c.type=='buy' ? 'sold' : 'bought';
                gp[traded]+=c.total;
            }
            // Do we need to extend the grid?
            // If we don't have a buy and a sell, then yes.
            // --------------------------------------------
            bs = bSides.find(b => b.userref==c.sym+'USD'); // Just call it 'pair' #USD Refactor
            if(bs.buy && bs.sell) {
                // console.log("Still between buy and sell.");
                ++nexes;
            } else if(bs.price==c.price) { // The lowest sell or highest buy
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
                        await order('sell',c.sym,sp,c.volume,
                            getLev(portfolio,'sell',sp,c.volume,c.sym,false),c.userref,
                            gp.sell);
                        gp = ngp;
                   } while(sp <= 1*portfolio[c.sym][1]);
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
                        }
                        await order('buy',c.sym,bp,c.volume,
                            getLev(portfolio,'buy',bp,c.volume,c.sym,false),c.userref,
                            gp.buy);
                        gp = ngp;
                    } while(bp >= 1*portfolio[c.sym][1])
                }
            }
        }
    }
    // console.log(gPrices);
    console.log(nexes,"orders did NOT require extension.");
    // console.log(comps);
    if(portfolio){
        portfolio['O'] = opensA;
        portfolio['G'] = gPrices;
    }
    return opensA;
}

// getLev is NOT idempotent: It depletes availability.
// ---------------------------------------------------
function getLev(portfolio,buysell,price,amt,xmrbtc,posP) {
    let lev = 'none';
    if(buysell == 'buy') {
        if(1*price > 1*portfolio[xmrbtc][1] && posP)
            return "Buying "+xmrbtc+" @ "+price+" isn't a limit order.";
        if(price*amt > 1*portfolio['ZUSD'][2]) { // #USD Refactor - This doesn't support leverage
            lev = '2';                           // on non-USD pairs. Hunt ZUSD and add basePair(pair) to get base.
        } else {
            portfolio['ZUSD'][2] -= price*amt;   // #USD Refactor and basePair()
        }
    } else {
        if(price*1 < 1*portfolio[xmrbtc][1] && posP) return "Selling "+xmrbtc+" @ "+price+" isn't a limit order.";
        //console.log("We have "+portfolio[xmrbtc][2]+" "+xmrbtc);
        if(amt*1 > 1*portfolio[xmrbtc][2]) {
            lev = '2';
        } else {
            portfolio[xmrbtc][2] -= amt;
        }
        //console.log("Now we have "+portfolio[xmrbtc][2]+" "+xmrbtc);
    }
    if(verbose) console.log("Leverage will be "+lev);
    return lev;
}

async function kill(o,oa) {
    if(0 == o) {
        const killAll = prompt("Cancel ALL orders? [y/N]");
        if(/^y/i.test(killAll)) {
            let killed = await kapi('CancelAll');
            console.log(314,killed);
        } else { console.log("Maybe be more careful."); }
        return;
    } else if(safeMode) {
        console.log("In Safemode, so NOT killing "+o);
        return;
    } else if('string'==typeof(o) && o.match(/-/)) {
        console.log("Killing "+o+"...");
        let killed = await kapi(['CancelOrder', {txid: o}]);
        console.log(320,killed);
    } else if(o < 100000) {
        let idxo = oa[o-1];
        console.log("Killing "+idxo[0]+"(described as "+idxo[1].descr.order+"...");
        let killed = await kapi(['CancelOrder', {txid: idxo[0]}]);
        console.log(325,killed);
        idxo[0] = 'Killed: '+ idxo[0];
        idxo[1].descr.order = 'Killed: '+idxo[1].descr.order;
    } else {
        console.log("Killing userref "+o+"...");
        let killed = await kapi(['CancelOrder', {txid: o}]);
        console.log(329,killed);
    }
//    console.log(331,"Waiting a second.");
//    await sleep(1000);
}

/*
   Note that handleArgs handles string arguments as collected from process.stdin.
   This means that true and 1, as args, are strings, not a boolean and a number.
 */
async function handleArgs(portfolio, args, uref = 0) {
    if(/buy|sell/.test(args[0])) {
        [buysell,xmrbtc,price,amt,posP] = args;
        let total=price*amt;
        if(total > 100000) return total+" is too much for code to "+buysell;

        // console.log(buysell+"ing "+amt+xmrbtc+" for "+price+".");

        // Do we need leverage?
        // --------------------
        let lev = getLev(portfolio,buysell,price,amt,xmrbtc,posP);
        let cPrice = !isNaN(portfolio['G'][uref]) ? portfolio['G'][uref][buysell=='buy'?'sell':'buy'] : 0;
        // Without a record of a closing price, use the last one we found.
        // ---------------------------------------------------------------
        if(!cPrice) cPrice = portfolio[xmrbtc][1];
        // When passing 1 as close, it will mean close at 1 (if Risky) or at current price (without Risky)
        // -----------------------------------------------------------------------------------------------
        let closeO = posP ? (posP !== 'true'            // posP is a number, not the boolean
            ? (posP !== '1' || risky ? posP : cPrice)   // use the number unless it's 1 and Risky is off
            : cPrice) : null;                           // NaN, so current price or nothing.
        let ret = await order(buysell,xmrbtc,price,amt,lev,uref,closeO);
        console.log("New order: "+ret);
        return;
    } else if(args[0] == 'set') {
        await set(portfolio, args[1], args[2], args[3]);
    } else if(args[0] == 'reset') {
        portfolio['G'] = [];
        await listOpens(portfolio);
    } else if(args[0] == 'delev') {
        await deleverage(portfolio['O'],args[1]-1);
    } else if(args[0] == 'addlev') {
        await deleverage(portfolio['O'],args[1]-1,true);
    } else if(args[0] == 'refnum') {
        await refnum(portfolio['O'],args[1]-1,args[2]);
    } else if(args[0] == 'list') {
        await list(args);
    } else if(/^(less|more)$/.test(args[0])) {
        await lessmore('less'==args[0],args[1]-1,args[2],'all'==args[3]);
    } else if(args[0] == 'test') {
        // Put some test code here if you want
        // -----------------------------------
    } else if(/^(y|Y)/.test(prompt("Try "+args[0]+" raw?"))) {
        let raw = await kapi(args);
        console.log(392,raw);
    } else {
        return args[0]+" is not yet implemented.";
    }
}

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
        if(!/USD$/.test(o.descr.pair)) {
            console.log("Userref update to non-USD pairs is not yet supported.");
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
    if(verbose) console.log("Lessmore called with ",oid,amt,all);
}

async function list(args) {
    let sortedA = [], orders = portfolio['O'];
    if(args[1] == 'C') {
        let ur = args[2] ? args.pop() : false,
            response = ur
                ? await kapi(['ClosedOrders',{userref:ur}])
                : await kapi('ClosedOrders');
        orders = [];
        for( o in response.result.closed) {
            let oo = response.result.closed[o];
            if(oo.status=='closed') orders.push([o,response.result.closed[o]]);
        }
        args.pop();
    }
    orders.forEach((x,i) => {
        let ldo = x[1].descr.order;
        if(args.length==1 || RegExp(args[1]).test(ldo))
            console.log(i+1,ldo,x[1].userref,x[1].status=='closed'
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
        sortedA.forEach((x,i) => {
            let ldo = x[1].descr.order;
            console.log(i+1, x[1].descr[args[1]]
                ? x[1].descr[args[1]] : x[1][args[1]],
                ldo,x[1].userref,x[1].descr.close);
        });
    };
}

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
            amt=Math.round(10000*(Number(o.vol) - Number(o.vol_exec)))/10000,
            lev=o.descr.leverage[0]=='n'?"none":'2';
        console.log("Attempting "+bs+' '+sym+' '+p+' '+amt+' '+lev+' '+newRef+"...");
        await kill(oid+1, opensA);
        await order(bs,sym,p,amt,lev,newRef);
    } else {
        console.log(oRef+" already has userref "+o.userref);
    }
}

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
        o.descr.price,Math.round(10000*(Number(o.vol) - Number(o.vol_exec)))/10000,
        (undo ? '2' : 'none'),o.userref);
    } else {
    placed = await order(o.descr.type,/^([A-Z]+)USD/.exec(o.descr.pair)[1],
        o.descr.price,Math.round(10000*(Number(o.vol) - Number(o.vol_exec)))/10000,
        (undo ? '2' : 'none'),o.userref,
        /[0-9.]+$/.exec(o.descr.close)[0] );
    }
    if(/^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/.test(placed)) { // Depends on Exchange's TxID
        await kill(oid+1, opensA);
    }
}


function set(p,ur,type,price) {
    if(ur) {
        let gp = p['G'].find(g => g.userref==ur);
        if(!gp) {
            gp = {userref:Number(ur),buy:'?',sell:'?'};
            p['G'].push(gp);
        }
        console.log(405,gp);
        gp[type] = price;
    }
    p['G'].sort((a,b) => a.userref-b.userref);
    let profits = 0;
    p['G'].forEach(x => {
        let f = toDec(((x.sell-x.buy)*Math.min(x.bought,x.sold)),2);
        console.log(x.userref+': '+x.buy+'-'+x.sell
            + ((x.bought+x.sold)>0
                ? (", bought "+toDec(x.bought,2)+" and sold "+toDec(x.sold,2)+' for ' + f)
                : '' ));
        if(!isNaN(f)) profits += f;
    });
    console.log("That's "+toDec(profits,2)+" since "+new Date(ts150*1000));
}

function toDec(n,places) {
    let f = 10**places;
    return Math.round(n*f)/f;
}
async function report(portfolio,showBalance=true) {
    let dataPromise = [
        'Balance',
        ['Ticker',{ pair : USDPairs.join() }],
        'TradeBalance'
    ];
    try {
        dataPromise[0] = await kapi(dataPromise[0]);
        dataPromise[1] = await kapi(dataPromise[1]);
        dataPromise[2] = await kapi(dataPromise[2]);
    } catch(err) {
        catcher(411,err);
        console.log(423,"Waiting a minute...");
        await sleep(60000);
        return;
    }
    let [bal,tik,trb] = dataPromise;
    let mar = await marginReport(false);
    portfolio['M'] = mar;
    delete bal.result.KFEE;
    delete bal.result.BSV;
    delete bal.result.ADA;

    let price;
    for( const p in bal.result) {
        let ts = p+'USD',               // #USD Refactor and basePair()
            tsz = p+'ZUSD',             // #USD Refactor and basePair()
            sym = /^X/.test(p) ? p.substr(1) : p,
            amt = toDec(bal.result[p],4);
        if(ts in tik.result) price = tik.result[ts].c[0];
        else if(tsz in tik.result) price = tik.result[tsz].c[0];
        price = toDec(price,(sym=='EOS'?4:2));
        portfolio[sym]=[amt,price,amt]; // holdings w/reserves, price, holdings w/o reserves
        if(mar[sym]) portfolio[sym][0] = toDec(portfolio[sym][0]+mar[sym].open,4);
        if(showBalance) console.log(p+"\t"+w(portfolio[sym][0],16)+price);
    }
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
    //console.log(portfolio);
    console.log(new Date,' ',(auto>0?'A':'.')+(risky?'R':'.')+(safeMode?'S':'.'));
    await listOpens(portfolio,true);
    process.stdout.write("\033[A".repeat(cli.apl));
    cli.apl = 2;
}

function w(n,x) { let s = n.toString(); return s+' '.repeat(x-s.length); }

async function marginReport(show = true) {
    let positions = await kapi(['OpenPositions',{consolidation:"market"}]);
    let brief = [];
    if(Object.keys(positions.result).length) {
        positions.result.forEach( (pos) => {
            let vol = (1*pos.vol-1*pos.vol_closed)*(pos.type=='sell' ? -1 : 1),
                sym = /^X/.test(pos.pair) ? pos.pair.slice(1,4) : pos.pair.slice(0,-3);
            vol = toDec(vol,8);
            brief[sym] = {
                open:       vol,
                sym:        pos.pair,
                margin:     pos.margin };
        });
        if(show) console.log(475,brief);
    }
    return brief;
}

let stopNow = false,
    portfolio = [],
    ts150 = 0,
    delay = 60,
    auto = 0,
    verbose = false,
    risky = false,
    cmdList = [],
    safeMode = true,
    USDPairs = 'XBTUSD,XMRUSD,BCHUSD,DASHUSD,EOSUSD,ETHUSD,LTCUSD,USDTUSD,USTUSD,LUNAUSD'.split(',');
    auto_on_hold = false;
    cli = {'apl': 0};
async function runOnce(cmdList) {
    let cmds = cmdList.map((x) => { return x.trim(); }),
        cdx = 0;
    auto_on_hold = auto>0;
    
    console.log("Got "+(cmds.length)+" commands...");
    while(cdx < cmds.length) {
        let args = cmds[cdx++].split(' ').map((x) => { return x.trim(); });
        console.log("...("+cdx+")> "+args.join(' '));
        try {
            if(args[0] == 'kill') await kill(args[1],portfolio['O']);
            else if(args[0] == "ws") {
                if(kwsCheck) console.log("Kraken WebSocket heartbeat at "+kwsCheck);
                if(!kwsCheck || (new Date()).valueOf() > 10000+kwsCheck.valueOf()) {
                    openSocket();
                }
            } else if(args[0] == "report" || args[0] == "") await report(portfolio);
            else if(/^(manual)$/.test(args[0])) {
                clearInterval(auto);
                auto = 0;
            } else if(args[0] == "auto") {
                clearInterval(auto);
                if(args[1]&&!isNaN(args[1])) delay = args[1];
                let counter = delay;
                auto = setInterval(async function() {
                    if(0 == --counter) {
                        if(!auto_on_hold) await report(portfolio,false);
                        counter = delay;
                    }
                },1000);
                await report(portfolio);
            } else if(args[0] == "risky") {
                risky = !risky;
                console.log("Risky Mode is "+(risky 
                    ? 'on - Experimental additions will be tried' : 'off'));
            } else if(args[0] == "safe") {
                safeMode = !safeMode;
                console.log("Safe Mode is "+(safeMode 
                    ? 'on - Orders will be displayed butnot placed' : 'off'));
            } else if(args[0] == "verbose") {
                verbose = !verbose;
                console.log("Verbose is "+(verbose ? 'on' : 'off'));
            } else if(args[0] == 'margin') {
                await marginReport();
            } else await handleArgs(portfolio, args, 0).then(console.log);
        } catch(err) {
            catcher(468,err);
        }
        // Wait a sec for the nonce.
        // -------------------------
        await sleep(1000);
    }
    //console.log("Try CRTL-C while I sleep for a minute...");
    //await sleep(1000);
    cmd = null;
    auto_on_hold = false;
}

function catcher(line,err) {
    if(/ETIMEDOUT/.test(err.code)) return; // We can ignore timeout errors.
    console.log("Line "+line+";\n",err);
    clearInterval(auto);
    auto = 0;
}

process.on('uncaughtException', function (err) {
    catcher(0,err);
});

let kwsCheck;
async function krakenSaid(obj) {
    if(obj.event=='heartbeat') {
        kwsCheck = new Date();
    } else {
        console.log(557,obj);
        if(Array.isArray(obj)) {
            await runOnce(['report']).catch((err) => { catcher(543,err); });
        }
    }
}

// Subscribe to OwnOrders Websocket
// --------------------------------
const WebSocket = require('ws');
async function openSocket() {
    let wsAuthToken = await kapi(['GetWebSocketsToken']);
    while(!wsAuthToken) {
        console.log(570,"Waiting a second...");
        await sleep(1000);
        wsAuthToken = await kapi(['GetWebSocketsToken']);
    }
    let myOrders = new WebSocket('wss://ws-auth.kraken.com');
    myOrders.on('message', msg => krakenSaid(JSON.parse(msg)));
    await new Promise(resolve => myOrders.once('open', resolve));
    console.log(wsAuthToken);
    myOrders.send(JSON.stringify({
        event:'subscribe',
        subscription: {
            name:'ownTrades',
            token:wsAuthToken.result.token
        }}));
};

runOnce(['report']).catch((err) => { catcher(578,err); });
console.log("Safemode is on.  `safe` toggles it.");

process.stdin.on('readable', () => {
    // clearInterval(auto);
    let cmd = '',
        waiter = 0;
        data = '';
    while(null != (data = process.stdin.read())) cmd += data;
    if(/^quit/.test(cmd)) {
        process.exit(0);
    } else {
        clearTimeout(waiter);
        waiter = setTimeout(() => {
            // Do we need to stop this listener from listening while runOnce runs?
            if(cmdList.length > 0) runOnce(cmdList).catch((err) => { catcher(496,err); });
            cmdList = [];
            },100);
        cmdList.push(cmd);
    }
});

