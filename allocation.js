#!/usr/bin/env node

export const AllocCon = (config, assets = [{ticker:'ZUSD',target:1}]) => {
    // Hang on to the bot when it's passed...
    const {bot, Savings} = config;
    const   portfolio = bot.getPortfolio();
    let myTotal = 0;
    const   ranges = [];
    const   atargs = [];
    let pending = '';   // When bestTrade makes an order, we remember it
                        // in order to avoid placing another while it pends.

// console.trace("Allocation: ", ID, j);

    function getbot() { return bot; }

    function sigdig(x,sig=6,dp=6) {
        const sd = Math.min(dp,Math.floor(sig-Math.log10(Math.abs(x))));
            const mag = 10**sd;
        return Math.round(mag*x)/mag;
    }

    function price7(x) { return sigdig(x,6,2); }

    async function findRange(ticker, ppct, today = false) {
        let pair = bot.findPair(ticker, portfolio.Numeraire);
        let HB;
        let SL;
        let response;
        let result;
        let prices;
        let peidx = -1;
        let pidx;
        let pHB;
        let pSL;
        let params;
        const periods = [21600,10080,1440,240,60,30,15,5,1];
    // console.log("Adjust for",ticker,apct,ppct);
        if(pair > '') {
            params = {pair,interval:periods[peidx +=1]};
            if(today) {
                params.since = (new Date())/1000 - 86400;   // Since 24 hours ago
                params.interval = 5;                        // We will get 288 OHLC data.
                peidx = 7;
            }
            response = await bot.kapi(["OHLC",params]);
            // prices is an array of arrays of:
            // timestamp, open, high, low, etc.
            // --------------------------------
            result = response.result;
            [pair,] = Object.keys(result);
            prices = result[pair];
            pidx = prices.length-1;
            [HB,SL] = [prices[pidx][2],prices[pidx][3]];
            // While we haven't spanned ppct, go back further.
            // -----------------------------------------------
            while(HB === 0 || HB/SL < 1+ppct) {
                [pHB,pSL] = [prices[pidx -= 1][2],prices[pidx][3]];
                HB = pHB > HB ? pHB : HB;
                SL = pSL < SL ? pSL : SL;
               // console.log("For",ticker,"HB-SL is",HB,'-',SL,(HB/SL),"at",pidx);
            }
            // Periods are in minutes and we can get up to 720 of them.
            // How fine a resolution can we use?
            // ---------------------------------
            const minutes = periods[peidx]*(prices.length-pidx); // Total minutes covered
            const minmin = minutes/720;     
            while(periods[peidx + 1] > minmin)
                peidx += 1;
   // console.log({minutes,minmin,peidx});
            response = await bot.kapi(["OHLC",{pair,interval:periods[peidx]}]);
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
                if(process.TESTING === 'findRange' && pHB+pSL>0) console.log(339,{SL,HB,pSL,pHB});
                // If both exceeded, assume whichever is closer to the close was last.
                // -------------------------------------------------------------------
                if(!(pHB>0 && pSL>0)) { // One or zero exceeded.
                    if(pHB > 0) HB = pHB;
                    else if(pSL > 0) SL = pSL;      // Updated it...
                } else if((pHB>0 && pSL>0)) { // both exceeded.
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
                if(process.TESTING === 'findRange' && pHB+pSL>0) console.log(359,{SL,HB,pSL,pHB});
            });
            console.log("For",ticker,"HB-SL is",HB,'-',SL);
            return [HB,SL];
        }
        return false; 
    }

    async function adjust(ticker, apct, ppct) {
        const already = assets.find(a => a.ticker === ticker);

        // Do we still have enough cash if everything bottoms out?
        // -------------------------------------------------------
        let numer = assets[0].target;
        assets.forEach(a => {
            if(a.adjust && a.ticker !== ticker)
                numer -= a.adjust[0];
        });
        if(numer < apct) {
            console.log("At market bottoms, you would run out of cash.\n"
                + "Please choose a lower allocation percentage or\n"
                + "lower the allocation adjustment for another asset.");
            return; 
        }

        if(!already) throw Error(`${ticker} not found in portfolio.`);
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
        // the allocation function (and subtract it from  the allocation
        // of cash).  This is what get() does and why targets must be
        // retrieved using that function.
        ranges[ticker] = await findRange(ticker, ppct);
    }
/*    function recover() {
        if(Array.isArray(j)) assets = j;
        else if(typeof j === 'string' || j instanceof String) {
            assets = JSON.parse(j);
        } else assets = j.assets || assets;
        assets.forEach(a => {
// console.trace("Adjusting",a.ticker);
            if(a.adjust) adjust(a.ticker,a.adjust[0],a.adjust[1]);
            else atargs[a.ticker] = a.target;
        });
        if( j.SavCon ) Savings = j.SavCon;
    }

    if(j) {
        recover();
//        console.trace("Allocation Recovered: ",j);
//        console.trace("Ranges[XXBT]:",ranges['XXBT']);
    }
*/
    function save() { return JSON.stringify({assets}); }

    function toString() { return save(); }

    function size() { return assets.length; }

    // update is NOT idempotent.  The adjustment to the Numeraire
    // MUST be cumulative, so it must be reset before running
    // through the assets to apply adjustments.  See get().
    // ----------------------------------------------------------
    async function update(asset) {
        if(!ranges[asset.ticker]) {
            if( asset.adjust )
                await findRange(asset.ticker, asset.adjust[1]);
            else {
                console.log(`${asset.ticker} has no adjustment.`);
                return;
            }
        } else {
            const t = asset.ticker;
            const ap = asset.adjust[0];   // How much of the allocation are we using?
            const p = portfolio[t][1]; let // Current price
            [HB,SL] = ranges[t];    // The high and low within which we adjust.
            const pp = HB/SL - 1;         // What portion of price range do we use?
            const heur = (p-SL)/(HB-SL);
            let toAdd = (1-heur) * ap;

            if(heur < 0) { // price is too low, drag HB down.
                SL = p;
                HB = SL * (1+pp);
                toAdd = ap;
            } else if(heur > 1) { // Too high, drag SL up.
                HB = p;
                SL = HB / (1+pp);
                toAdd = 0;
            }
            if( !(heur >= 0 && heur <= 1) ) ranges[t] = [HB,SL];
            atargs[t] = asset.target + toAdd;
            atargs[assets[0].ticker] -= toAdd;  // NOT idempotent!

            // console.log(t,"at",p,"is",pct(heur),"% between",SL,"and",HB,
              //  "so adding",toAdd,"to",asset.target);
        }
    }

    async function get(i) { 
//        console.log("Allocation.get ",i);
        const ret = (Number.isInteger(i) 
            ? assets[i]
            : assets.find(a => (a.ticker === i)))
            || (assets[assets.push({ticker:i, target:0})-1]);
        // adjust everything to determine numeraire allocation
        // ---------------------------------------------------
        atargs[assets[0].ticker] = assets[0].target;
        await Promise.all ( assets.map(async a => {
            if(a.adjust) update(a);
        }));
        return ret;
    }

    async function atarg(ticker, move = 0) {
        const realPrice = await bot.getPrice(ticker); 
        if(move !== 0) {
            const atargOrig = atargs[ticker];
            if(portfolio.Numeraire === ticker) return atargs[ticker];
            // eslint-disable-next-line no-param-reassign
            portfolio[ticker][1] = (move<0)
                ? realPrice / (1-move)  // move is negative!
                : realPrice * (1+move);
            const rangeOrig = ranges[ticker] ? [ranges[ticker][0],ranges[ticker][1]] : false;
            await get(ticker); // This updates ranges, which must be undone.
            const ret = atargs[ticker];
            // Undo range update that may have happened.
            // -----------------------------------------
            if(rangeOrig) ranges[ticker] = rangeOrig;
            // eslint-disable-next-line no-param-reassign
            portfolio[ticker][1] = realPrice;
            atargs[ticker] = atargOrig;
            return ret;
        }
// console.log({move,ticker,realPrice,ret:atargs[ticker]});
        await get(ticker);
        return atargs[ticker];
    }

    function pct(x) { return (Math.round(10000*x)/100); }
    
    // This function will propose the command you'd use
    // to make the trade that will most bring you into balance,
    // by trading between the asset you need the most and the
    // one you have too much of for the first pair that has a
    // market on the exchange (bot.getPairs())
    // --------------------------------------------------------
    async function bestTrade(current,inTkr='',FullValue=1000) {
        const priorities = [];
        const pnum = portfolio.Numeraire;
        let pair = '';
        let tkr = inTkr;
        let c; 
        let del; 
        let tooMuch; 
        let notEnough; 
        let pairA;
        console.log("Total:",FullValue,pnum);
        if(assets[0].ticker !== pnum) throw new Error("First asset must be Numeraire!");
        if(size() < 3) tkr = assets[1].ticker;
        if(tkr > '') {
            c = await current.get(tkr);
            if(c) {
                await get(tkr);   // Update adjustment if necessary
                del = atargs[tkr] - c.target;   // target - actual, pos. means not enough.
                if(del < 0) { // we need to sell some.
                    tooMuch = {t:tkr,d:del};
                    notEnough = {t:pnum,d:-del}; // Same del because we don't balance Numeraire.
                } else {
                    notEnough = {t:tkr,d:del};
                    tooMuch = {t:pnum,d:-del};
                }
            } else {
                console.log(tkr,"is not in the portfolio.");
                throw Error(`${tkr} is not in the portfolio.`);
            }
        } else { 
            await Promise.all( assets.map(async a => {
                if(a.ticker === pnum) return;
                c = await current.get(a.ticker);  // Note: this calls actual allocation "target"
                await get(a.ticker); // This updates the adjustment if there is one
                if(typeof(c) !== 'undefined') {
                    del = atargs[a.ticker] - c.target;  // target - actual, pos. means not Enough
                    priorities.push({t:a.ticker,d:del});
                    console.log(a.ticker,`\t${pct(c.target)}`,`\t${pct(atargs[a.ticker])}`,`\t${
                        pct(del)}`,bot.getTickers().includes(a.ticker) ? '' : '(-> cash)',
                        ranges[a.ticker]?ranges[a.ticker]:'');
                    if(!bot.getTickers().includes(a.ticker)) priorities[0].d += del;
                }
            }));
            priorities.sort((a,b) => a.d - b.d); // +d goes after -d
 // console.log(priorities);
            tooMuch = priorities.shift();
            notEnough = priorities.pop();
        }
        while(tooMuch && !portfolio[tooMuch.t]) {
            tooMuch = priorities.shift();
        }
        while(notEnough && !portfolio[notEnough.t]) {
            notEnough = priorities.pop();
        }
        
        let buysell; let price; let nPrice; let amt; let sg; let dp;
            let isNumer = true; // returned to indicate trade is against Numeraire. 
            let numer; // numer is the currency being used to buy or sell.
            let base; // base is what we will buy or sell.
        while(pair === '' && ![typeof(tooMuch),typeof(notEnough)].includes('undefined')) {
            [pair,pairA] = bot.findPair(notEnough.t,tooMuch.t,-1)  // Buy notEnough
                ||  bot.findPair(tooMuch.t,notEnough.t,-1)         // Sell tooMuch
                || ['',null];
            if(pair !== '') {
                del = notEnough.d < -tooMuch.d ? notEnough.d : -tooMuch.d;
                if((del) < 0) {
                    if([tooMuch.t,notEnough.t].includes(pnum)) {
                        del = Math.min(Math.abs(notEnough.d),Math.abs(tooMuch.d));
                    }
                }
                numer = pairA.quote;
                base = pairA.base;
                if(numer === tooMuch.t)
                    buysell = 'buy ';
                else if(numer === notEnough.t)
                    buysell = 'sell ';
                else buysell = '';
        // If tkr, then we need to buy or sell depending on its del,
        // regardless of how it compares to pnum
        // ---------------------------------------------------------
                sg = 6;
                dp = pairA.pair_decimals;
                if( buysell === '') throw Error(`${pair} didn't match ${tooMuch.t} or ${notEnough.t}`);
                // Set price to 1 if symbol not in portfolio.
                //     It will be skipped anyway.
                // ------------------------------------------
                [,price] = (portfolio[base]||[1,1]);
                nPrice = price;
                amt = sigdig(del*FullValue/price);
    // console.log({base,del,FullValue,price,tooMuch,notEnough,pairA});
                // Adjust price if tooMuch is NOT portfolio.Numeraire
                // --------------------------------------------------
                if(portfolio.Numeraire !== numer) {
                    console.log(numer,'is not',portfolio.Numeraire); 
                    price = sigdig(price/portfolio[numer][1],sg,dp);
                    console.log("Price in",numer,"is",price);
                    isNumer = false;
                }
            } else {
                console.log(notEnough.t,tooMuch.t,"not available.");
                // Replace the smallest priority in case we try again.
                // ---------------------------------------------------
                if(Math.abs(tooMuch.d)<notEnough.d) {
                    tooMuch = priorities.shift();
                    while(tooMuch && !portfolio[tooMuch.t]) {
                        tooMuch = priorities.shift();
                    }
                } else {
                    notEnough = priorities.pop();
                    while(notEnough && !portfolio[notEnough.t]) {
                        notEnough = priorities.pop();
                    }
                }
            }
        }
        // Check limits
        // ------------
        const sumTotal = nPrice*amt; let of = 0;
        if(sumTotal > portfolio.limits[1] && portfolio.limits[1]!==-1) {
            of = amt;
            amt = amt*portfolio.limits[1]/(1.001*sumTotal); // allow 1/1000 leeway
            console.log(sumTotal,"is more than",`${portfolio.limits[1]
                }, so I'm lowering the amount to`,amt);
        }
        if(buysell && pair && price && amt)
            console.log('Trade:',`${buysell+pair} ${price} ${amt}`);
        else console.log("226: No trade could be made [buysell,pair,price,amt].",
            [buysell,pair,price,amt]);
        if(pending > '') {
            console.log("Waiting for",pending,"to execute first.");
            const found = portfolio.O.find(o => o[0] === pending);
            if(typeof(found) === 'undefined') {
                console.log("Looks like",pending,"completed.");
                pending = '';
            }
            else console.log("I found",found[0],"in Open Orders.");
        }
        // if(pending == '') 
            // pending = await bot.order(buysell.trim(),pair,sigdig(price,6,4),sigdig(amt));
        return {pending, pair, price, amt, type:buysell.trim(), of, isNumer};
    }

    function addAsset(ticker,target) {
        let already = assets.find(a => a.ticker === ticker);
        if(assets[0].target < target - (already ? already.target : 0)) 
            throw Error('Allocations exceed 100%');
        if(target < 0) throw new Error('Cannot allocate a negative amount.');
        if(!already) {
            assets.push(already = {ticker,target:Number(target)});
        } else {
            // eslint-disable-next-line no-param-reassign
            assets[0].target += already.target;
            already.target = target;
        }
        atargs[ticker] = already.target;
        // eslint-disable-next-line no-param-reassign
        assets[0].target -= target;
        return true;
    }

    function getTotal() { return myTotal; }

    async function list(compare=false) {
        const total = getTotal();
            let str = `\nticker\ttarget\t(adjusted)\t(Range)\t(apct,ppct)\t${ compare
                ? `${compare.name  }\tdiff\t`
                : '\t\t' }Total: ${total}`;
        await Promise.all(assets.map(async (a) => {
 // console.log("Getting",a);
            await get(a.ticker);  // Forces an update
            const t = Math.round(1000*a.target)/10;
                const at = atargs[a.ticker];
                const atd = Math.round(1000*at)/10;
            if(compare) {
                const cagt = await compare.alloc.get(a.ticker);
                    const ctarg = (cagt && compare) ? cagt.target : 0;
                    const diff = compare ? pct(ctarg - at) : 0;
                    const trade = (diff < 0 ? 'Buy ' : 'Sell ') + 
                        Math.round(Math.abs(diff)*total*100)/10000;
                str = `${str  }\n${  a.ticker  }\t${  t  }%\t${  atd  }%\t${
                    a.adjust ? ranges[a.ticker].map(price7) : '\t'  }\t${
                    a.adjust ? `(${  a.adjust.join(',')  })` : '\t'  }\t${
                    pct(ctarg)  }%\t${  trade}`;
            } else str = `${str  }\n${  a.ticker  }\t${  t  }%\t${  atd  }%`;
        }));
        return str;
    }

    // When an asset is added or set to a different allocation,
    // the numeraire (asset at index 0) is set to maintain 100%.
    // --------------------------------------------------------
    function setNumeraire(ticker) {
        const old = assets.findIndex((a) => a.ticker === ticker);
        if(old !== -1) {
            // eslint-disable-next-line no-param-reassign
            [assets[0],assets[old]] = [assets[old],assets[0]];
        } else assets.unshift({ticker,target:0});
        portfolio.Numeraire = ticker;
    }

    // Return the trading range for an adjusted asset
    function getRange(ticker) { return ranges[ticker]; }

    async function getAlloc(tkr,alloc) { 
        const ret = await alloc.atarg(tkr);
        return ret ? sigdig(100*ret,5,2) : 0;
    }

    // By default this returns the current allocation.
    // When desired is true, it returns the desired
    //   allocation or false if there isn't one yet.
    // ------------------------------------------------------ 
    async function getAllocation(desired = false, refresh = true) {
        if(desired) {
            return (portfolio.Allocation && portfolio.Allocation.size() > 0)
                ? portfolio.Allocation
                : false;
        }
        if(refresh) { 
            console.log("350 refreshing...");
            await bot.report(false);
        }
        // If user added something to desired allocation and hasn't got
        // any, we want to list it as 0 in "current" allocation.
        await Promise.all(portfolio.Allocation.assets.map(async a => { 
            if(!portfolio[a.ticker] && a.target > 0) {
                const p = await bot.getPrice(a.ticker);
                portfolio[a.ticker] = [0,p,0,0]; 
            }
        }));
        const total = Savings({AllocCon});
        // Add Savings to total.
        // ---------------------
        portfolio.Savings.forEach(sav => {
            total.add(Savings({AllocCon, ...sav}))
        });
        
    // console.log(total.list("OffExchange", true));
        // Add Exchange assets to total.
        // -----------------------------
// console.log("Savings.tickers:",Savings.tickers);
        portfolio.Tickers.forEach(sym => {
            if(total.validTicker(sym)) {
// console.log("getTotal,total:",total.getTotal(), total);
                const tndx = (sym===portfolio.Numeraire?0:3);
                total.updateAsset(sym,portfolio[sym][tndx],false,true);
            } // else console.log("Skipping",sym);
        });
        const ret = await total.getAlloc(portfolio.Numeraire || 'ZUSD',
            bot.numerairesFromPairs());
        myTotal = total.getTotal();
        return ret;
    }

    // Update ranges if today's hi/lo exceeds.
    // tickerLH is an object with tickers for property names,
    // each one being an object itself with l and h arrays
    // indicating the low and high for today (0) and for
    // the last 24 hours (1), as per Kraken.
    async function setRanges(tickersLH) {
        let pair; let tk; let mr; let rt; let tl; let th; let f; let p; let moved=false;
        await Promise.all(Object.entries(tickersLH).map(async (t) => {
            [pair,mr] = t;
            tk = bot.findPair(pair,undefined,1).base;
            if(undefined === tk) return;
            [tl,th,p] = [mr.l[1],mr.h[1],mr.c[0]].map(Number);
            rt = ranges[tk];
            if(rt) {
                f = rt[0]/rt[1];    // get % of Price range to use.
                if(th/tl > f) {     // The prices today exceeded our range, so...
                    await findRange(tk,f-1,true);
                    moved = true;
                } else if( rt[0] < th ) {
                    rt[0] = th;     // High is from today.
                    rt[1] = th / f; // Calculate the low.
                    moved = true;
                } else if( rt[1] > tl ) {
                    rt[1] = tl;
                    rt[0] = tl * f;
                    moved = true;
                }
                if(moved) console.log("Range for",tk,"updated: ",ranges[tk]);
                else if( config.bot.FLAGS.verbose )
                    console.log("No range was changed:[t,tk,mr,rt0,rt1,tl,th,p,moved]:"
                        +`${[pair,tk,mr,rt[0],rt[1],tl,th,p,moved]}.`);
            }   // If !ranges[tk] then we don't have a range to set!
        }));
    }

    async function Allocations() {
        const tkrs = Array.from(portfolio.Tickers);
// console.trace("ID,assets,Tkrs:",ID,assets,tkrs.join(','));
        const allocs = {desired:await getAllocation(true, false), 
            current: await getAllocation(false, false)};
        const current = {}; 
        const desired = {}; 
        const outAdjust = {};
        const outRanges = {}; 
        let asset;
// console.trace("assets,Tkrs:",assets,tkrs.join(','));
// console.log("`allocation quiet` returned:",[allocs.desired.assets,allocs.current.assets]);
        allocs.desired.assets.forEach(a => {
            if(!tkrs.includes(a.ticker)) desired[a.ticker] = 0;
        });
        await Promise.all(tkrs.map(async t => {
            current[t] = await getAlloc(t, allocs.current);
            desired[t] = await getAlloc(t, allocs.desired);
            asset = allocs.desired.assets.find((a) => (a.ticker===t))
                || {ticker:t, target:0};
            outRanges[t] = allocs.desired.getRange(t);
            outAdjust[t] = String(asset.target) + (asset.adjust 
                ? `+${  asset.adjust.join('+')}` : "");
            return [current[t],desired[t]];
        }));
// console.log([current,desired,adjust,ranges]);
        return [current,desired,outAdjust,outRanges];
    }

    return Promise.all(assets.map(async a => {
        if(a.adjust) await adjust(a.ticker,a.adjust[0],a.adjust[1]);
        else atargs[a.ticker] = a.target;
    })).then(() => (
        { setNumeraire, list, addAsset, bestTrade, save,
            adjust, atarg, get, size, assets, toString, sigdig, getRange,
            Allocations, setRanges, getAllocation, getTotal, getbot }));
} 