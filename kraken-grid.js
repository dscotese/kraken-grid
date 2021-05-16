const fs = require('fs');

if(!fs.existsSync('../keys.js')) {
    console.log("Paste your key and secret between the single quotes and save this"
        +" to the parent folder as keys.js:\nexports.key='';\nexports.secret='';");
    process.exit(1);
}
const my           = require('../keys.js');
const key          = my.key; // API Key
const secret       = my.secret; // API Private Key
const KrakenClient = require('kraken-api');
const kraken       = new KrakenClient(key, secret);
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function kapi(arg)
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
        if(/ETIMEDOUT/.test(err.code) || /nonce/.test(err.message)) {
            console.log(22,"Timed out or bad nonce, so trying again 5s...");
            await sleep(5000);
            ret = await kapi(arg);
        } else {
            catcher(26,err);
        } 
    }
    return ret;
}

async function order(buysell, xmrbtc, price, amt, lev='none', uref=0, closeO=null) {
    if(closeO) closeO.price = Number(closeO.price);
    price = Number(price);
    amt = Number(amt);
    if( closeO && closeO.price == price ) closeO = null;
    console.log(27,buysell+"ing "+amt+" "+xmrbtc+" at "+price+
        (!closeO || closeO.price == price ? "" : " to close at "+closeO.price));
    // let ordered;
    let response = await kapi(['AddOrder',
    {   pair:           xmrbtc+'USD',
        userref:        uref,
        type:           buysell,
        ordertype:      'limit',
        price:          price,
        volume:         amt,
        leverage:       lev,
        close:          closeO
    }]);
    console.log(40,(d = response.result.descr) 
        ? d : 'No result.descr from kapi');
    console.log(42,"Cooling it for a second...");
    await sleep(1000);
    if(verbose) console.log(44,response);
}

async function listOpens(portfolio = null, isFresh=false) {
    let response = await kapi('OpenOrders'),
        opens = response.result.open;
    let opensA  = [],
        comps   = [],
        gPrices = [],
        bSides  = [],
        ci,oo,od,rv,n=0,ur,op,cp,gpi,ct,bs;
        // Index for comps, n?, Closing Price, index to grid prices,
        // and bs is "Both sides", holding an array of objects
        // holding userref, and two bookeans, buy and sell.
    if(portfolio&&portfolio['G']) gPrices = portfolio['G'];
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
        }
        // BothSides record for crypto
        // ---------------------------
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
                gp = {userref:ur,buy:'?',sell:'?'};
                gPrices.push(gp);
                console.log(gp.userref,'('+od.type+')','buy:',gp.buy,'sell:',gp.sell);
            }
            gp[od.type] = op;
            gp[ct] = cp;
        }
        gp = gPrices.find(gprice => gprice.userref==ur&&ur>0);
        cp = gp ? gp[ct] : '?';
        if(++n == 0) {
            console.log(125, opens[o]);
        }

        ci = od.pair+od.price+od.type; // pair is symUSD - picks up externals
        if(!comps[ci]) {
            comps[ci]={
                total:          rv,
                volume:         Number(oo.vol),
                type:           od.type,
                sym:            /^([A-Z]+)USD/.exec(od.pair)[1],
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
        if(!Boolean(od.close)) console.log(154,od.order+" had no close.");
        let orid;
        if((orid = oldRefs.indexOf(o)) > -1) {
            oldRefs.splice(orid, 1);
        } else {
            console.log(159, "New: ",o,opensA.length, od.order, oo.userref, cp);
            if(verbose) console.log(160,oo);
        }
            
        if(portfolio && isFresh && od.leverage == "none") {
            if(od.type == "buy") {
                // Deplete our cash
                // ----------------
                portfolio['ZUSD'][2] -= od.price*opens[o].vol;
            } else {
                // Deplete available crypto
                // ------------------------
                portfolio[od.pair.slice(0,-3)][0] -= opens[o].vol;
            }
        }
    }
    if(oldRefs.length > 0) console.log("Gone: "+oldRefs);

    let nexes = 0, // Orders not requiring extension
        dontask = false;
    for( comp in comps ) {
        let c = comps[comp],
        gp = gPrices.find(gprice => gprice.userref==c.userref);
        bs = bSides.find(b => b.userref==c.userref);
        if(!gp) {
            gp = {userref:c.userref,buy:'?',sell:'?'};
            gPrices.push(gp);
            console.log(gp.userref,'('+comp.slice(-4)+')','buy:',gp.buy,'sell:',gp.sell);
        }
        gp[c.ctype] = c.open;
        gp[c.type]  = c.price;
        [,sym,price] = /([A-Z]+)USD([0-9.]+)/.exec(comp);
        /*console.log("Checking:\n" + c.type + ' ' 
            + sym + ' ' + price + ' ' + Math.round(c.total*10000)/10000
            + (c.open ? ' to '+c.ctype+'-close @'+c.open : '') +' (' + c.userref + "):")
      */  if(!isNaN(c.open)) {
            if(c.ids.length > 1) {
                console.log(Object.values(c.ids));
                for(const id of c.ids) { await kill(id,null); }
                await order(c.type,sym,price, Math.round(c.total*10000)/10000,
                   c.lev,c.userref,{ordertype:'limit',price:c.open});
                c.hasClose = true;
            } 
        } else if(c.userref > 0) {
            gp[c.ctype] = dontask ? '?' : prompt("Set a "+c.ctype
                + (c.ctype=='buy' ? ' under ' : ' over ')
                + gp[c.type] + " for "+c.userref+' '+c.sym+' ');
            if(isNaN(gp[c.ctype])) dontask = true;
        }
        // Do we want a close and not have one?
        // ------------------------------------
        if(c.open && !isNaN(c.open)) { // Close Price never gets set if we don't want one
            // are there both buys and sells for this userref?
            // -----------------------------------------------
            if(bs.buy && bs.sell) {// We might handle this later
                console.log("Not handling "+c.sym+'@'+c.price+" because it's still on both sides.");
            } else {
                if(!c.hasClose) {
                    console.log("Ensure closing: replacing "+c.ids.length+" trades with "
                        +c.type+" "+c.sym+' '+c.price+' '+c.total+' closing @'+gp[c.ctype]);
                    // Kill and Re-order the order, but with the close
                    // -----------------------------------------------
                    await kill(c.userref,null);
                    await order(c.type,c.sym,c.price,c.total,c.lev,c.userref,
                        {ordertype:'limit',price:c.open});
                }

                // Do we need to extend the grid?
                // If we don't have a buy and a sell, then yes.
                // --------------------------------------------
                bs = bSides.find(b => b.userref==c.sym+'USD');
                if(bs.buy && bs.sell) {
                    // console.log("Still between buy and sell.");
                    ++nexes;
                } else if(bs.price==c.price
                    && gp) { // The lowest sell or highest buy
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
                            c.userref -= 10000000;
                            ngp = {userref:c.userref,
                                buy:gp.sell,
                                sell:String(sp)};
                            gPrices.push(ngp);
                            console.log(ngp.userref,'(sell)',
                                'buy:',ngp.buy,'sell:',ngp.sell);
                            console.log(249,"sell "+c.sym+' '+sp+' '+c.volume
                                +" to close at "+gp.sell);
                            await order('sell',c.sym,sp,c.volume,
                                getLev(portfolio,'sell',sp,c.volume,c.sym,false),c.userref,
                                {ordertype:'limit',price:gp.sell});
                            gp = ngp;
                       } while(sp <= 1*portfolio[c.sym][1]); 
                    } else {
                        do {
                            bp = Math.round(decimals*gp.buy*gp.buy/gp.sell)/decimals;
                            c.userref -= 1000000;
                            ngp = {userref:c.userref,
                                buy:String(bp),
                                sell:gp.buy};
                            gPrices.push(ngp);
                            console.log(ngp.userref,'( buy)',
                                'buy:',ngp.buy,'sell:',ngp.sell);
                            console.log(264,"buy "+c.sym+" "+bp+' '+c.volume
                                +" to close at "+gp.buy);
                            await order('buy',c.sym,bp,c.volume,
                                getLev(portfolio,'buy',bp,c.volume,c.sym,false),c.userref,
                                {ordertype:'limit',price:gp.buy});
                            gp = ngp;
                        } while(bp >= 1*portfolio[c.sym][1])
                    }
                }
            }
        }
    }
    // console.log(gPrices);
    console.log(nexes,"orders didn't require extension.");
    // console.log(comps);
    if(portfolio){
        portfolio['O'] = opensA;
        portfolio['G'] = gPrices;
    }
    return opensA;
}

function getLev(portfolio,buysell,price,amt,xmrbtc,posP) {
    let lev = 'none';
    if(buysell == 'buy') {
        if(1*price > 1*portfolio[xmrbtc][1] && posP) return "Buying "+xmrbtc+" @ "+price+" isn't a limit order.";
        if(price*amt > 1*portfolio['ZUSD'][2]) {
            lev = '2';
        } else {
            portfolio['ZUSD'][2] -= price*amt;
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
    console.log("Leverage will be "+lev);
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
    } else if('string'==typeof(o) && o.match(/-/)) {
        console.log("Killing "+o+"...");
        let killed = await kapi(['CancelOrder', {txid: o}]);
        console.log(320,killed);
    } else if(o < 100000) {
        let idxo = oa[o-1];
        console.log("Killing "+idxo[0]+"(described as "+idxo[1].descr.order+"...");
        let killed = await kapi(['CancelOrder', {txid: idxo[0]}]);
        console.log(325,killed);
    } else {
        console.log("Killing userref "+o+"...");
        let killed = await kapi(['CancelOrder', {txid: o}]);
        console.log(329,killed);
    }
    console.log(331,"Waiting a second.");
    await sleep(1000);
}

async function handleArgs(portfolio, args, uref = 0) {
    if(/buy|sell/.test(args[0])) {
        [buysell,xmrbtc,price,amt,posP] = args;
        if(!/XMR|XBT|ETH|LTC|DASH|EOS|BCH/.test(xmrbtc)) return xmrbtc+" is not yet supported.";
        let total=price*amt;
        if(total > 100000) return total+" is too much for code to "+buysell;

        // console.log(buysell+"ing "+amt+xmrbtc+" for "+price+".");

        // Do we need leverage?
        // --------------------
        let lev = getLev(portfolio,buysell,price,amt,xmrbtc,posP);
        let cPrice = portfolio['G'][uref] ? portfolio['G'][uref][buysell=='buy'?'sell':'buy'] : 0;
        // Without a record of a closing price, use the last one we found.
        // ---------------------------------------------------------------
        if(!cPrice) cPrice = portfolio[xmrbtc][1];
        let closeO = posP ? { ordertype: 'limit', price: cPrice } : null;
        let ret;
        await order(buysell,xmrbtc,price,amt,lev,uref,closeO);
        return;
    } else if(args[0] == 'set') {
        set(portfolio, args[1], args[2], args[3]);
    } else if(args[0] == 'reset') {
        portfolio['G'] = [];
        await listOpens(portfolio);
    } else if(args[0] == 'delev') {
        await deleverage(portfolio['O'],args[1]-1);
    } else if(args[0] == 'list') {
        portfolio['O'].forEach((x,i) => {
            console.log(i+1,x[1].descr.order,x[1].userref,x[1].descr.close);
        });
    } else if(/^(y|Y)/.test(prompt("Try "+args[0]+" raw?"))) {
        await kapi(args);
    } else {
        return args[0]+" is not yet implemented.";
    }
}

async function deleverage(opensA,oid) {
    let o, oRef;
    if(!opensA[oid]) {
        console.log("Order "+oid+" not found.");
        return;
    } else {
        [oRef,o] = opensA[oid];
    }
    if(o.descr.leverage == 'none') {
        console.log(oRef+" is not leveraged.");
        return;
    }
    if(!o.descr.close) {
    await order(o.descr.type,/^([A-Z]+)USD/.exec(o.descr.pair)[1],
        o.descr.price,Math.round(10000*(Number(o.vol) - Number(o.vol_exec)))/10000,
        'none',o.userref);
    } else { 
    await order(o.descr.type,/^([A-Z]+)USD/.exec(o.descr.pair)[1],
        o.descr.price,Math.round(10000*(Number(o.vol) - Number(o.vol_exec)))/10000,
        'none',o.userref,{ ordertype: 'limit', price: /[0-9.]+$/.exec(o.descr.close)[0] });
    }
    await kill(oid+1, opensA);
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
    console.log(p['G'].sort((a,b) => a.userref-b.userref));
}

async function report(portfolio,showBalance=true) { 
    let dataPromise = [
        'Balance',
        ['Ticker',{ pair : 'XBTUSD,XMRUSD,BCHUSD,DASHUSD,EOSUSD,ETHUSD,LTCUSD' }],
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
    delete bal.result.KFEE;

    let price;
    for( const p in bal.result) {
        let ts = p+'USD',
            tsz = p+'ZUSD';
        if(ts in tik.result) price = tik.result[ts].c[0];
        else if(tsz in tik.result) price = tik.result[tsz].c[0];
        portfolio[/^X/.test(p) ? p.substr(1) : p]=[bal.result[p],price,bal.result[p]];
        if(showBalance) console.log(p+"\t"+bal.result[p]+"\t"+price);
    }
    if(showBalance) {
        console.log("Cost\t"+trb.result['c']);
        console.log("Value\t"+trb.result['v']);
        console.log("P & L\t"+trb.result['n']);
    }
    //console.log(portfolio); 
    await listOpens(portfolio,true);
    console.log(new Date);
}

const prompt = require('prompt-sync')({sigint: true});
let stopNow = false,
    portfolio = [],
    histi = Math.floor(Date.now() / 1000),
    delay = 60,
    auto = 0,
    verbose = false;
    cmdList = [];
async function runOnce(cmdList) {
    //while(!stopNow) {
      //  if(cmd==null) cmd = prompt((auto>0 ? '('+delay+' min.)' : 'manual')+'>');
        let cmds = cmdList.map((x) => { return x.trim(); }),
            cdx = 0;

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
                    auto = setInterval(() => {
                        if(0 == --counter) {
                            report(portfolio,false);
                            counter = delay;
                        }
                    },1000);
                    await report(portfolio);
                } else if(args[0] == "verbose") {
                    verbose = !verbose;
                    console.log("Verbose is "+(verbose ? 'on' : 'off'));
                } else await handleArgs(portfolio, args, ++histi).then(console.log);
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
    //}
}

process.stdin.on('readable', async () => {
    // clearInterval(auto);
    let cmd = '',
        waiter = 0;
        data = '';
    while(null != (data = process.stdin.read())) cmd += data;
    if(/^quit/.test(cmd)) {
        console.log("Userref collisions possible with restart before "
            + new Date(histi * 1000));
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

/* console.log(err) seems to have made this:
RequestError: Timeout awaiting 'request' for 5000ms
    at ClientRequest.<anonymous> (/home/dscotese/nodejs/kraken-api/node_modules/got/dist/source/core/index.js:956:65)
    ...
    at processTimers (node:internal/timers:500:7) {
  name: 'TimeoutError',
  code: 'ETIMEDOUT',
  timings: {
    start: 1619948216984,
    ...
    }
  },
  event: 'request'
}
*/
function catcher(line,err) {
    if(/ETIMEDOUT/.test(err.code)) return; // We can ignore timeout errors.
    console.log("Line "+line+";\n",err);
    clearInterval(auto);
}

process.on('uncaughtException', function (err) {
    catcher(0,err);
});

let kwsCheck;
function krakenSaid(obj) {
    if(obj.event=='heartbeat') {
        kwsCheck = new Date();
    } else {
        console.log(557,obj);
        if(Array.isArray(obj)) {
            runOnce(['report']).catch((err) => { catcher(543,err); });
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

