const prompt = require('prompt-sync')({sigint: true});
const Bot = require('./bot.js');
const Man = require('./manager.js');
module.exports = (j=false) => { // Allocation object constructor
    let assets = [{ticker:'ZUSD',target:1}],
        ranges = [],
        atargs = [],
        pending = '';   // When bestTrade makes an order, we remember it
                        // in order to avoid placing another while it pends.

    function whoami() { return whoami.caller.name; }

    function recover(j) {
        if(Array.isArray(j)) assets = j;
        else if(typeof j === 'string' || j instanceof String) {
            try {
                assets = JSON.parse(j);
            } catch (err) {
                console.log("failed with: ",j);
                throw err;
            }
        } else assets = j.assets;
        assets.forEach(a => {
            if(a.adjust) adjust(a.ticker,a.adjust[0],a.adjust[1]);
            else atargs[a.ticker] = a.target;
        });
    }

    if(j) {
        recover(j);
        // console.log("Allocation Recovered: ",j);
    }

    function save() { return JSON.stringify({assets}); }

    function toString() { return save(); }

    function size() { return assets.length; }

    function get(i) { 
//        console.log("Allocation.get ",i);
        let ret = Number.isInteger(i) 
            ? assets[i]
            : assets.find(a => {return a.ticker == i;}); 
        // adjust everything to determine numeraire allocation
        // ---------------------------------------------------
        atargs[assets[0].ticker] = assets[0].target;
        assets.forEach(a => {
            if(a.adjust) update(a);
        });
        if('undefined' == typeof(ret))
            console.log("No allocation ("+i+") in",assets);
        return ret;
    }

    async function atarg(ticker, move = 0) {
        let bot=Bot.s,
            realPrice = await bot.getPrice(ticker); 
        if(move != 0) {
            if(bot.portfolio.Numeraire == ticker) return atargs[ticker];
            bot.portfolio[ticker][1] = (move<0)
                ? realPrice / (1-move)
                : realPrice * (1+move);
            let range_orig = ranges[ticker] ? [ranges[ticker][0],ranges[ticker][1]] : false;
            get(ticker); // This updates ranges, which must be undone.
            // Undo range update that may have happened.
            // -----------------------------------------
            if(range_orig) ranges[ticker] = range_orig;
            bot.portfolio[ticker][1] = realPrice;
        }
// console.log({move,ticker,realPrice,ret:atargs[ticker]});
        return atargs[ticker];
    }

    // update is NOT idempotent.  The adjustment to the Numeraire
    // MUST be cumulative, so it must be reset before running
    // through the assets to apply adjustments.  See get().
    // ----------------------------------------------------------
    function update(asset) {
        if(ranges[asset.ticker]) {
            let bot = Bot.s,
                t = asset.ticker,
                ap = asset.adjust[0],   // How much of the allocation are we using?
                p = bot.portfolio[t][1],// Current price
                [HB,SL] = ranges[t],    // The high and low within which we adjust.
                pp = HB/SL - 1,         // What portion of price range do we use?
                heur = (p-SL)/(HB-SL),
                toAdd = (1-heur) * ap;

            if(heur < 0) { // price is too low, reset range
                SL = p;
                HB = SL * (1+pp);
                toAdd = ap;
            } else if(heur > 1) { // Too high, drag SL up.
                HB = p;
                SL = HB / (1+pp);
                toAdd = 0;
            }
            if( !(0 <= heur && heur <= 1) ) ranges[t] = [HB,SL];
            atargs[t] = asset.target + toAdd;
            atargs[assets[0].ticker] -= toAdd;  // NOT idempotent!

            //console.log(t,"at",p,"is",pct(heur),"% between",SL,"and",HB,
              //  "so adding",toAdd,"to",asset.target);
        } else throw Error("No range for "+asset.ticker);
    }

    function pct(x) { return (Math.round(10000*x)/100); }
    function dlr(x) { return Math.round(x); }
    function sigdig(x,sig=6,dp=6) {
        let sd = Math.min(dp,Math.floor(sig-Math.log10(Math.abs(x)))),
            mag = 10**sd;
        return Math.round(mag*x)/mag;
    }
    // This function will propose the command you'd use
    // to make the trade that will most bring you into balance,
    // by trading between the asset you need the most and the
    // one you have too much of for the first pair that has a
    // market on the exchange (Bot.pairs)
    // --------------------------------------------------------
    async function bestTrade(current,tkr='',FullValue=1000) {
        let priorities = [],
	        bot = Bot.s,
            pnum = bot.portfolio.Numeraire,
            pair = '',
            c, del,tooMuch,notEnough,pairA;
        console.log("Total:",FullValue,pnum);
        if(assets[0].ticker != pnum) throw new Error("First asset must be Numeraire!");
        if(tkr > '') {
            if(c = current.get(tkr)) {  // Assignment is intentional!
                get(tkr);   // Update adjustment if necessary
                del = atargs[tkr] - c.target;   // target - actual, pos. means not enough.
                if(del < 0) { // we need to sell some.
                    tooMuch = {t:tkr,d:del};
                    notEnough = {t:pnum,d:-del}; // Same del because we don't balance Numberaire.
                } else {
                    notEnough = {t:tkr,d:del};
                    tooMuch = {t:pnum,d:-del};
                }
            } else {
                console.log(tkr,"is not in the portfolio.");
                throw Error(tkr+" is not in the portfolio.");
            }
        } else { 
            assets.forEach(a => {
                c = current.get(a.ticker);  // Note: this calls actual allocation "target"
                get(a.ticker); // This updates the adjustment if there is one
                if('undefined' != typeof(c)) {
                    del = atargs[a.ticker] - c.target;  // target - actual, pos. means not Enough
                    priorities.push({t:a.ticker,d:del});
                    console.log(a.ticker,'\t'+pct(c.target),'\t'+pct(atargs[a.ticker]),'\t'+
                        pct(del),Bot.tickers.includes(a.ticker) ? '' : '(-> cash)',
                        ranges[a.ticker]?ranges[a.ticker]:'');
                    if(!Bot.tickers.includes(a.ticker)) priorities[0].d += del;
                }
            });
            priorities.sort((a,b) => { return a.d - b.d; }); // +d goes after -d
 console.log(priorities);
            tooMuch = priorities.shift();
            notEnough = priorities.pop();
        }
        while(tooMuch && !bot.portfolio[tooMuch.t]) {
            tooMuch = priorities.shift();
        }
        while(notEnough && !bot.portfolio[notEnough.t]) {
            notEnough = priorities.pop();
        }
        
        let buysell, price, nPrice, amt, sg, dp,
            isNumer = true, // returned to indicate trade is against Numeraire. 
            numer, // numer is the currency being used to buy or sell.
            base; // base is what we will buy or sell.
        while(pair == '' && ![typeof(tooMuch),typeof(notEnough)].includes('undefined')) {
            [pair,pairA] = Bot.findPair(notEnough.t,tooMuch.t,-1)  // Buy notEnough
                ||  Bot.findPair(tooMuch.t,notEnough.t,-1)         // Sell tooMuch
                || ['',null];
            if(pair != '') {
                if(0 > (del = notEnough.d < -tooMuch.d ? notEnough.d : -tooMuch.d)) {
                    if([tooMuch.t,notEnough.t].includes(pnum)) {
                        del = Math.min(Math.abs(notEnough.d),Math.abs(tooMuch.d));
                    }
                }
                numer = pairA.quote;
                base = pairA.base;
                buysell = numer == tooMuch.t ? 'buy ' 
                    : (numer == notEnough.t ? 'sell ' : '');
        // If tkr, then we need to buy or sell depending on its del,
        // regardless of how it compares to pnum
        // ---------------------------------------------------------
                sg = 6;
                dp = pairA.pair_decimals;
                if( buysell == '') throw Error(pair+" didn't match "+tooMuch.t+' or '+notEnough.t);
                //Set price to 1 if symbol not in portfolio.
                //     It will be skipped anyway.
                // ------------------------------------------
                price = (bot.portfolio[base]||[1,1])[1];
                nPrice = price;
                amt = sigdig(del*FullValue/price);
    // console.log({base,del,FullValue,price,tooMuch,notEnough,pairA});
                // Adjust price if tooMuch is NOT portfolio.Numeraire
                // --------------------------------------------------
                if(bot.portfolio.Numeraire != numer) {
                    console.log(numer,'is not',bot.portfolio.Numeraire); 
                    price = sigdig(price/bot.portfolio[numer][1],sg,dp);
                    console.log("Price in",numer,"is",price);
                    isNumer = false;
                }
            } else {
                console.log(notEnough.t,tooMuch.t,"not available.");
                // Replace the smallest priority in case we try again.
                // ---------------------------------------------------
                if(Math.abs(tooMuch.d)<notEnough.d) {
                    tooMuch = priorities.shift();
                    while(tooMuch && !bot.portfolio[tooMuch.t]) {
                        tooMuch = priorities.shift();
                    }
                } else {
                    notEnough = priorities.pop();
                    while(notEnough && !bot.portfolio[notEnough.t]) {
                        notEnough = priorities.pop();
                    }
                }
            }
        }
        // Check limits
        // ------------
        let sumTotal = nPrice*amt, of = 0;
        if(sumTotal > bot.portfolio.limits[1] && bot.portfolio.limits[1]!=-1) {
            of = amt;
            amt = amt*bot.portfolio.limits[1]/(1.001*sumTotal); // allow 1/1000 leeway
            console.log(sumTotal,"is more than",bot.portfolio.limits[1]+
                ", so I'm lowering the amount to",amt);
        }
        if(buysell && pair && price && amt)
            console.log('Trade:',buysell+pair+' '+price+' '+amt);
        else throw Error("226: No trade could be made.");
        if(pending > '') {
            console.log("Waiting for",pending,"to execute first.");
            let found = bot.portfolio.O.find(o => {return o[0] == pending;});
            if('undefined' == typeof(found)) {
                console.log("Looks like",pending,"completed.");
                pending = '';
            }
            else console.log("I found",found[0],"in Open Orders.");
        }
        // if(pending == '') 
            // pending = await bot.order(buysell.trim(),pair,sigdig(price,6,4),sigdig(amt));
        return {pending, pair, price, amt, type:buysell.trim(), of:of, isNumer};
    }

    async function adjust(ticker, apct, ppct) {
        let bot = Bot.s,
            pair = Bot.findPair(ticker, bot.portfolio.Numeraire),
            already = assets.find(a => a.ticker == ticker);

        // Do we still have enough cash if everything bottoms out?
        // -------------------------------------------------------
        let numer = assets[0].target;
        assets.forEach(a => {
            if(a.adjust && a.ticker != ticker)
                numer -= a.adjust[0];
        });
        if(numer < apct) {
            console.log("At market bottoms, you would run out of cash.\n"
                + "Please choose a lower allocation percentage or\n"
                + "lower the allocation adjustment for another asset.");
            return; 
        }

        if(!already) throw Error(ticker+" not found in portfolio.");
        already.adjust = [apct, ppct];    // Allocation % and Price %
        // Setup, in the recover function, will call findRange to
        // determine the ATH and Subsequent Low (SL)
        // after it. ppct refers to the width in % of the band in which
        // the allocation will fluctuate proportionally so that at the
        // bottom of that band (SL), the allocation will be apct higher
        // than at the top (HB).

        // If SL is under ATH/(1+ppct), then the ATH is too high
        // to be the top of the band HB and the setup code will have to
        // find the high after the SL, which might be more than
        // (SL*(1+ppct)), requring another search for a new SL.  This
        // search continues until we have HB and SL for which SL <=
        // HB/(1+ppct). If the new high is not more than (SL*(1+ppct)),
	    // then HB will be (SL*(1+ppct)) and the search ends.

        // Once we have SL and HB, we can determine where in that range
        // the current price is, from 0% - 100%, and add that portion
        // of apct to the allocation percentage stored on disk to use in
        // the allocation function (and add the same to the allocation
        // of cash).  This is what get() does and why targets must be
        // retrieved using that function.
        ranges[ticker] = await findRange(ticker, apct, ppct);
    }

    async function findRange(ticker, apct, ppct) {
        if(['args',whoami()].includes(process.TESTING))
            console.log(whoami(),"called with",arguments);
        let bot = Bot.s,
            pair = Bot.findPair(ticker, bot.portfolio.Numeraire),
            HB,SL,response, result, prices, peidx = -1, pidx,
            pHB,pSL;
        const periods = [21600,10080,1440,240,60,30,15,5,1];
    //console.log("Adjust for",ticker,apct,ppct);
        if(pair > '') {
            response = await Bot.s.kapi(["OHLC",{pair:pair,interval:periods[++peidx]}]);
            // prices is an array of arrays of:
            // timestamp, open, high, low, etc.
            // --------------------------------
            result = response.result;
            pair = (Object.keys(result))[0];
            prices = result[pair];
            pidx = prices.length-1;
            [HB,SL] = [prices[pidx][2],prices[pidx][3]];
            // While we haven't spanned ppct, go back further.
            // -----------------------------------------------
            while(HB == 0 || HB/SL < 1+ppct) {
                pHB = prices[--pidx][2];
                pSL = prices[pidx][3];
                HB = pHB > HB ? pHB : HB;
                SL = pSL < SL ? pSL : SL;
               // console.log("For",ticker,"HB-SL is",HB,'-',SL,(HB/SL),"at",pidx);
            }
            // Periods are in minutes and we can get up to 720 of them.
            // How fine a resolution can we use?
            // ---------------------------------
            let minutes = periods[peidx]*(prices.length-pidx),
                minmin = minutes/720;
            while(periods[++peidx] > minmin);
   // console.log({minutes,minmin,peidx});
            response = await Bot.s.kapi(["OHLC",{pair:pair,interval:periods[peidx]}]);
            result = response.result;
            prices = result[pair];
            [HB,SL] = [Number(prices[0][2]),Number(prices[0][3])];
            prices.forEach(a => {
                [pHB,pSL] = [0,0];
                if(Number(a[2]) > HB) {
                    pHB = Number(a[2]);
                }
                if(Number(a[3]) < SL) {
                    pSL = Number(a[3]);
                }
                if(process.TESTING == 'findRange' && pHB+pSL>0) console.log(339,{SL,HB,pSL,pHB});
                // If both exceeded, assume whichever is closer to the close was last.
                // -------------------------------------------------------------------
                if(!(pHB>0 && pSL>0)) { // One or zero exceeded.
                    if(pHB > 0) HB = pHB;
                    else if(pSL > 0) SL = pSL;      // Updated it...
                } else if((pHB>0 && pSL>0)) { // Both exceeded.
                    if( pHB-Number(a[4]) > Number(a[4])-pSL ) {
                        pHB = 0;
                        SL = pSL;
                    } else {
                        pSL = 0;
                        HB = pHB;
                    }
                }
                // ... Pull them closer if necessary.
                if(HB/(1+ppct) > SL) {
                    if(pHB > 0) SL = HB/(1+ppct);
                    else HB = SL*(1+ppct);
                }
                if(process.TESTING == 'findRange' && pHB+pSL>0) console.log(359,{SL,HB,pSL,pHB});
            });
            console.log("For",ticker,"HB-SL is",HB,'-',SL);
            return [HB,SL];
        } else {
            console.log("No pair found for",ticker,"and",bot.portfolio.Numeraire);
        }	
    }

    function addAsset(ticker,target) {
        let already = assets.find(a => a.ticker == ticker);
        if(assets[0].target < target - (already ? already.target : 0)) 
            throw Error('Allocations exceed 100%');
        if(target < 0) throw 'Cannot allocate a negative amount.';
        if(!already) {
            assets.push(already = {ticker:ticker,target:Number(target)});
        } else {
            assets[0].target += already.target;
            already.target = target;
        }
        atargs[ticker] = already.target;
        assets[0].target -= target;
        return true;
    }

    function list(compare=false) {
        let total = Man.s.getTotal(),
            str = "\nticker\ttarget\t(adjusted)\t(Range)" + (compare
                ? '\t' + compare.name + '\tdiff' + '\t'
                : '') + "Total: "+total;
        assets.forEach((a) => {
 // console.log("Getting",a);
            get(a.ticker);  // Forces an update
            let t = Math.round(1000*a.target)/10,
                at = atargs[a.ticker],
                atd = Math.round(1000*at)/10;
            if(compare) {
                let cagt = compare.alloc.get(a.ticker),
                    ctarg = (cagt && compare) ? cagt.target : 0,
                    diff = compare ? pct(ctarg - at) : 0,
                    trade = (diff < 0 ? 'Buy ' : 'Sell ') + 
                        Math.round(Math.abs(diff)*total*100)/10000;
                str = str + "\n" + a.ticker + "\t" + t + "%\t" + atd + '%\t'
                    +(a.adjust ? ranges[a.ticker].map(price7) : '\t') + '\t'
                    +(compare ? pct(ctarg)+'%\t'+trade : '');
            } else str = str + "\n" + a.ticker + "\t" + t + "%\t" + atd + '%';
        });
        return str;
    }

    function price7(x) { return sigdig(x,6,2); }

    // When an asset is added or set to a different allocation,
    // the numeraire (asset at index 0) is set to maintain 100%.
    // --------------------------------------------------------
    function setNumeraire(ticker) {
        let old = assets.findIndex((a) => { return a.ticker == ticker; });
        if(old != -1) {
            let numer = assets[old];
            assets[old] = assets[0];
            assets[0] = numer;
        } else assets.unshift({ticker:ticker,target:0});
    }

    return {setNumeraire, list, addAsset, bestTrade, save, recover,
        adjust, atarg, get, size, assets, toString, sigdig};
} 
