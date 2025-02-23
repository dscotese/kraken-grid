/* eslint-disable no-console */
import fs from 'fs';
function ReportCon(bot) {
    const TxIDPattern = /[0-9A-Z]{6}-[0-9A-Z]{5}-[0-9A-Z]{6}/;
    const KRAKEN_GCO_MAX = 50;
    // This function adds an iterator and the "forward" key to iterate
    //  through the orders property backwards or forwards.
    // KeysFwd means getting an array in which the zeroth
    // element is the trade with the lowest timestamp (first).
    // ---------------------------------------------------------------
    function keyOrder(keyed, pattern = TxIDPattern) {
        // eslint-disable-next-line no-param-reassign
        //        keyed.forward = true;
        const keys = Object.keys(keyed.orders);
        const K = keys.filter((x) => (pattern.test(x)));
        if (keys.length > K.length) { // Keys that don't match.
            console.log("Ignoring", (keys.length - K.length, "non-matching keys:"));
            console.log(keys.filter((x) => (!pattern.test(x))));
        }
        // "A negative value indicates that a should come before b."
        K.sort((a, b) => (keyed.orders[a].closetm - keyed.orders[b].closetm));
        const Kr = K.toReversed();
        // eslint-disable-next-line no-param-reassign
        keyed.keysFwd = () => K;
        // eslint-disable-next-line no-param-reassign
        keyed.keysBkwd = () => Kr;
        // eslint-disable-next-line no-param-reassign
        //        keyed.orders[Symbol.iterator] = function* reportOrder () {
        //            (keyed.forward ? K : Kr).forEach(yield);}
        return keyed;
    }
    let transientOffset = 0;
    // This function will collect count executed orders in reverse chronological order,
    // first the most recent (ofs=0) and then earlier history (ofs from known).
    async function getExecuted(count, known = {}) {
        let offset = 0; // Since the last call, one or more orders may have executed.
        let midway = false;
        let closed = { offset: 0, forward: false, orders: {} };
        let earliestInBatch = false;
        const preCount = Object.keys(known.orders).length;
        closed.hasFirst = known.hasFirst || known.offset === -1;
        // Is old format or not collected yet?
        if (!Object.prototype.hasOwnProperty.call(known, 'orders')) {
            Object.assign(known, { offset: 0, forward: false, orders: {} });
            console.log("known passed has no 'orders' property.");
        }
        if (Object.keys(known.orders).length > Object.keys(closed.orders).length)
            Object.assign(closed, known);
        while (count > 0) {
            console.log("Known:", Object.keys(known.orders).length, "Closed:", Object.keys(closed.orders).length, [known.offset, closed.offset]);
            // eslint-disable-next-line no-await-in-loop
            const mixed = await bot.kapi(['ClosedOrders', { ofs: offset, closetime: 'close' }]);
            const total = mixed.result.count;
            if (mixed.error.length > 0) {
                console.log("Errors:\n", mixed.error.join("\n"));
            }
            console.log("At", offset, "of", total, "results.");
            if (total === 0)
                return keyOrder(closed);
            // If more orders closed since our previous call, they will
            //  push everything further down the list and cause some old
            //  orders to be reported again.  These duplicates do not
            //  cause a problem when the list of closed orders is an object
            //  because the later assignments to the TxID (key) overwrite
            //  the earlier ones.
            // ClosedOrders might return pending, open, canceled, and expired
            //  orders too.  Remove them.
            // ------------------------------------------------------
            const executed = Object.entries(mixed.result.closed).filter((e) => (e[1].vol_exec !== "0.00000000"));
            const rCount = Object.keys(mixed.result.closed).length;
            const elen = executed.length;
            const missing = executed.find(e => (known.orders[e[0]] == undefined));
            offset += rCount;
            closed.offset = Math.max(transientOffset, offset);
            // eslint-disable-next-line no-param-reassign
            count -= elen;
            if (elen > 0) {
                const missed = missing ? `, including ${missing[0]} which was missing.` : '.';
                console.log(`Retrieved ${elen} executed orders${missed}`);
            }
            Object.assign(closed.orders, Object.fromEntries(executed));
            if (!closed.hasFirst) { // But do we have the latest yet?
                if (rCount < KRAKEN_GCO_MAX) { // We must have reached the earliest order.
                    if (closed.offset < total) // Should be impossible, so...
                        throw Error(`${offset} still < ${total} API returns < 50`);
                    console.log(`Total Executed orders collected: ${Object.keys(closed.orders).length}`);
                    closed.hasFirst = true;
                    break;
                }
                else if (!midway && !missing) {
                    console.log(`Jumping to the end... (${known.offset})`);
                    offset = known.offset; // so jump to the end.
                    closed.offset = offset;
                    midway = true;
                }
            }
            else if (offset < known.offset && count > 0) {
                // We have the earliest order, but more may have
                // executed since the last save. Let's at least
                // collect what was asked for if we haven't passed the
                // recorded offset.
                console.log("Checking for gaps in order collection...");
            }
            else {
                // If you wait long enough between running the bot, you
                // might get here without having collected all orders.
                closed.offset = known.offset;
                if (missing == undefined)
                    break; // All new orders collected.
            }
            transientOffset = Math.max(offset, transientOffset);
            offset = transientOffset;
        }
        transientOffset = Math.max(offset, transientOffset);
        closed = keyOrder(closed);
        const closedIDs = Object.keys(closed.orders);
        // Store closed orders in portfolio
        console.log(`Had ${preCount} @ ${closed.offset}, now ${closedIDs.length} orders.`);
        bot.getPortfolio().Closed = closed;
        if (preCount < closedIDs.length || !closed.hasFirst) {
            console.log(`(Re-?)Saving ${closedIDs.length} closed orders @ ${closed.offset}.`);
            bot.save();
        }
        return closed;
    }
    function yearStart() {
        const now = new Date();
        const ret = new Date(now.getFullYear(), 0, 1);
        return ret.toISOString();
    }
    // This ensures all orders have been retrieved
    //  and provides whatever information it can about the process.
    async function capGains(price = 100, sym = "BTC", ISOStart = yearStart(), buyFile = '', outFile = 'capGains.csv') {
        const started = Date.now();
        const notBefore = new Date(ISOStart).getTime();
        const closed = bot.getPortfolio().Closed;
        // Let's not go back before the beginning of the year
        while (closed.orders[closed.keysFwd()[0]].closetm > notBefore / 1000) {
            // eslint-disable-next-line no-await-in-loop
            await getExecuted(50, closed);
            if (Date.now() - started > 30000) {
                console.log("I'm stopping after thirty seconds.");
                return;
            }
        }
        console.log("I've collected", closed.keysFwd().length, " orders, and that goes back to ", new Date(closed.orders[closed.keysFwd()[0]].closetm * 1000));
        let borrowed = 0;
        let total = 0;
        // keyList will include keys of the form "EBx" where x is an
        // external buy saved in exb.
        const exb = [];
        const keyList = Array.from(closed.keysFwd());
        if (buyFile > '' && fs.existsSync(buyFile)) {
            // Put the file contents into a string
            const externalBuys = fs.readFileSync(buyFile).toString();
            const eb = JSON.parse(externalBuys);
            let ebi = 0;
            eb.forEach(b => {
                const price = (b.cost / b.amount).toFixed(2);
                const extBuy = {
                    closetm: new Date(b.date).getTime() / 1000,
                    remaining: String(b.amount),
                    descr: { price, type: 'buy' },
                    price,
                    cost: b.cost,
                    fee: 0,
                    vol_exec: String(b.amount),
                    ebi
                };
                borrowed += b.amount;
                exb.push(extBuy);
                ebi += 1;
            });
            exb.sort((a, b) => (a.closetm - b.closetm));
            let ei = 0;
            while (ei < exb.length) {
                const ii = keyList.findIndex(k => (((/^eb[0-9]+$/.test(k)
                    ? exb[Number(k.slice(2))]
                    : closed.orders[k]).closetm) > exb[ei].closetm));
                keyList.splice(ii, 0, `eb${ei}`);
                ei += 1;
            }
        }
        keyList.forEach(oid => {
            const t = /^eb[0-9]+$/.test(oid)
                ? exb[Number(oid.slice(2))]
                : closed.orders[oid];
            if (t.closetm < notBefore / 1000)
                return;
            const del = t.descr.type == 'buy'
                ? Number(t.vol_exec)
                : -Number(t.vol_exec);
            total += del;
            if (total < 0)
                borrowed = Math.min(borrowed, total);
        });
        // Validity requires that purchase happened earlier 
        // and that purchase hasn't been fully consumed:
        function getValidMatch(maxTS) {
            return bbp.find(x => (x.remaining > Number.EPSILON && x.closetm < maxTS));
        }
        let sbt = [], bbp = []; // SellsByTime, BuysByPrice
        keyList.forEach((oid, ti) => {
            const t = /^eb[0-9]+$/.test(oid)
                ? exb[Number(oid.slice(2))]
                : closed.orders[oid];
            t.ti = ti;
            if (t.closetm < notBefore / 1000)
                return;
            (t.descr.type == "buy" ? bbp : sbt).push(t);
            if (t.descr.type == "buy")
                Object.assign(t, { remaining: t.vol_exec });
        });
        // Already sorted! sbt.sort((a,b) => (a.closetm - b.closetm));
        if (borrowed < 0) {
            console.log(`Using ${price} as price of ${-borrowed} ${sym}.`);
            const cost = (price * -borrowed).toFixed(2);
            const bootStrapM = {
                closetm: 0,
                remaining: -borrowed.toFixed(8),
                descr: { price, type: 'buy' },
                ti: bbp.length,
                cost,
                price,
                fee: 0,
                vol_exec: -borrowed.toFixed(8)
            };
            bbp.push(bootStrapM);
        }
        bbp.sort((a, b) => (b.descr.price - a.descr.price));
        fs.writeFileSync(outFile, `Property,Acquired,Sold,Proceeds,Cost,Gain/Loss\n`, err => {
            if (err)
                console.error(err);
        });
        let accProceeds = 0;
        let accCost = 0;
        let accGL = 0;
        sbt.forEach(s => {
            if (s.closetm < notBefore / 1000)
                return;
            let volume = Number(s.vol_exec);
            const netProceeds = s.cost - s.fee;
            while (volume > Number.EPSILON) {
                let liquidated = 0;
                let m = getValidMatch(s.closetm);
                let proportion = 1;
                if (m.remaining >= volume) {
                    m.remaining -= volume;
                    liquidated += volume * m.descr.price;
                    proportion = volume / s.vol_exec;
                    volume = 0;
                }
                else {
                    liquidated += m.remaining * m.descr.price;
                    proportion = m.remaining / s.vol_exec;
                    volume -= m.remaining;
                    m.remaining = 0;
                }
                const adjCost = (liquidated + Number(m.fee * proportion)).toFixed(2);
                const gl = ((netProceeds * proportion) - adjCost);
                const gain = (gl < 0) ? `(${-gl.toFixed(2)})` : gl.toFixed(2);
                if (netProceeds * proportion > 0.005) {
                    fs.appendFileSync(outFile, `${sym},${new Date(m.closetm * 1000).toISOString().slice(0, 10)},${new Date(s.closetm * 1000).toISOString().slice(0, 10)},${(netProceeds * proportion).toFixed(2)},${adjCost},${gain}\n`, err => {
                        if (err)
                            console.error(err);
                    });
                }
                accProceeds += Number(netProceeds * proportion);
                accCost += Number(adjCost);
                accGL += Number(gl);
            }
        });
        const agl = accGL < 0 ? `(${-accGL.toFixed(2)})` : accGL.toFixed(2);
        fs.appendFileSync(outFile, `,,,${accProceeds.toFixed(2)},${accCost.toFixed(2)},${agl}\n`);
        console.log(`Wrote ${outFile}.`);
    }
    // Clear state for testing. 
    // This function reinitializes all private data.
    // Only transientOffset exists at this time.
    function reset() { transientOffset = 0; }
    return { getExecuted, capGains, reset };
}
export default ReportCon;
//# sourceMappingURL=reports.js.map
