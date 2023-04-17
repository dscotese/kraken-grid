const newAlloc = require('./allocation.js');
const Bot = require('./bot.js');
const Manager = require('./manager.js');
module.exports = function Balancer (target) {
    let counters = [],  // Interval timers to be cleared
        already = [],   // Pairs that are already gridded
        sigdig = target.sigdig; // Import this useful function

    function whoami() { return whoami.caller.name; }

    async function setTrades(move,tkr='') { // out-of-balance tolerance
        if(['args',whoami()].includes(process.TESTING))
            console.log(whoami(),"called with",arguments);
        let man = Manager.s,
            c   = await man.getAllocation(false); // Current alloc, and updates prices
        let total = man.getTotal(),
            p   = await target.bestTrade(c,tkr,total);
        if(p.of) console.log("Still",p.of-p.amt,p.pair,"to go...");
        else if(p.pair && p.isNumer) await buyAndSell(p, move);
        else if('' == p.pair) console.log("20: No tradable pair could be found.");
        else console.log("21: One time trade to save fees.");
    }
    
    // The first arg can be an order to place and that
    // indicates that we want to add the opposite
    // side using the moved price.  To do that, we need to
    // calculate how much we want to trade at that new
    // price and then place the trade with a conditional
    // close at the price of the passed in pending order.
    // These are the two prices of a grid point and the
    // situation is as if only part of one side executed,
    // the order we are to place.
    // We assume that the whole crypto market will move and
    // so calculate when to sell or buy based on how the
    // move affects the allocation.
    // ----------------------------------------------------
    async function buyAndSell(p, move) {
        move = Number(move);
        if(['args',whoami()].includes(process.TESTING))
            console.log(whoami(),"called with",arguments);
//console.log("buyAndSell called!");
        let bot = Bot.s;
        if(already.includes(p.pair)) { // Sanity check.
            console.log("Already set trades for",p.pair);
            return;
        }
        already.push(p.pair);   // Wait till trades are set?
        let po = Bot.pairs[p.pair],
            port = bot.portfolio,
            qisn = (po.quote == port.Numeraire), // If the quote for the pair isn't our Numeraire
            // then we will do only 1/3 of the volume and convert the prices accordingly. (see qisn)
            qf = qisn ? 1 : port[po.quote][1];   // Factor for adjustments

        let high = Manager.s.getTotal(),    // Will be total after move up
            low = high,                     // Will be total after move down
            cryptp = 0,                     // Percent of total that moves because it's crypto.
            atargU = await target.atarg(po.base, move),   // target after move up.
            curVal = high*(await target.atarg(po.base))   // Value before the move.
                +(p.amt ? p.amt*p.price*(p.type=='buy' ? -1 : 1)*qf: 0),
            atargD = await target.atarg(po.base, -move);  // target after move down.
        for(a of target.assets) {
            if(port[a.ticker] && a.ticker != bot.portfolio.Numeraire)
                cryptp += await target.atarg(a.ticker);
            if(isNaN(cryptp)) console.log("Cryptp isNaN after atarg of ",a.ticker,
                "was",(await target.atarg(a.ticker)));
        } // What percentage of the allocation is in crypto?
 // console.log({high,low,cryptp,qf,atargU,atargD,curVal}); //,curP,toSell,toBuy,sAmt,bAmt,sP,bP});
        high = cryptp*high*(1+move) + (1-cryptp)*high;  // The crypto piece increased, plus the rest.
        low  = cryptp*low/(1+move) + (1-cryptp)*low;    // Crypto piece decreased, plus the rest.
        // We need to know
        // how it looks with the new high and low so we can
        // see how much to sell or buy.
        let curP = port[po.base][1],    // Current price in Numeraire.
            toSell = high * (curVal*(1+move)/high - atargU),    // Actual pct after move up - target
            // atargU or atargD can be beyond the allocation after the move,
            // and this will make toSell or toBuy (respectively) negative.
            toBuy  = low * (atargD - (curVal/(1+move))/low),    // Target - actual pct after move down
            sAmt   = (toSell/curP)/(qisn ? 1 : 3),      // Amount to sell.
            bAmt   = (toBuy/curP)/(qisn ? 1 : 3),       // Amount to buy.
            sP = sigdig(curP*(1+move)/qf,6,po.pair_decimals),
            bP = sigdig((curP/(1+move))/(qisn ? 1 : port[po.quote][1]),6,po.pair_decimals);
        // We have the amount to sell and buy BEFORE being in balance,
        // but if we get in balance by selling or buying p.amt, that 
        // trade will be added to the buy or sell, so remove it for now.
        // -------------------------------------------------------------
        curP = p.price;
console.log({pamt:p.amt, bAmt, sAmt});
        if(p.type == 'buy') sAmt -= p.amt;
        if(p.type == 'sell') bAmt -= p.amt;
console.log({pamt:p.amt, bAmt, sAmt});
        bAmt = sigdig(bAmt,6,po.lot_decimals);
        sAmt = sigdig(sAmt,6,po.lot_decimals);
        console.log('buy',po.base,bP,bAmt,curP);
        console.log('sell',po.base,sP,sAmt,curP);
        if(toSell < 0 || toBuy < 0) {
            console.log("We are too far out of balance.  Try after some of the trade above is done.");
 // console.log({high,low,cryptp,qf,atargU,atargD,curVal,curP,toSell,toBuy,sAmt,bAmt,sP,bP});
            return;
        }
        // Now we have the trade to balance (p) and the
        // correct amounts for the two new trades to place.
        // The traded amount from p must be added to the other 
        // side if it happens first, and if the other side
        // happens first, then its amt must be added to p.
        // bot.order() using p will return an object {txid,uref}
        // so that we can use that uref for the other side, and
        // that will add those amounts properly when bot.listOpens
        // processes the open orders.
        // -------------------------------------------------------
        // We are replacing the grid for p.pair, so let's cancel
        // all its orders.
        let toCancel = bot.portfolio['O'].filter(o => { 
            return [p.pair,po.altname].includes(o[1].descr.pair); })
            .map(ae => ae[0]);
        console.log((bot.FLAGS.safe ? 'NOT ':'')+"Cancelling",toCancel);
        if(!bot.FLAGS.safe && toCancel.length>0)
            await bot.kill(toCancel);
        let Ordered = await bot.order(p.type,p.pair,p.price,p.amt,
            bot.getLev(bot.portfolio,p.type,p.price,p.amt,po.base,false),0,
            p.type=='buy'?sP:bP); //,uref,close
        if(Ordered.uref) { // Order placed, and there is the uref for the other side.
            bot.order('buy',p.pair,bP,bAmt,
                bot.getLev(bot.portfolio,'buy',bP,bAmt,po.base,false),
                p.type=='buy'?0:Ordered.uref,p.price);
            bot.order('sell',p.pair,sP,sAmt,
                bot.getLev(bot.portfolio,'sell',sP,sAmt,po.base,false),
                p.type=='buy'?Ordered.uref:0,p.price);
        }
console.log({high,low,cryptp,qf,atargU,atargD,curVal,curP,toSell,toBuy,sAmt,bAmt,sP,bP,Ordered});
    }

    return {setTrades};
};
