function Reports(bot) {
    let offset = 0,
        closed = {offset:0, forward:false, orders:{}};
    const TxIDPattern = /[0-9A-Z]{6}-[0-9A-Z]{5}-[0-9A-Z]{6}/; 

    // This function will collect count executed orders in reverse chronological order,
	// first the most recent (ofs=0) and then earlier history (ofs from known).
    async function getExecuted(count, known = {}) {
        if(!known.hasOwnProperty('orders')) { // Is old format or not collected yet
            known = {offset:0, forward:false, orders:{}};
            console.log("known passed has no 'orders' property.");
        }
        console.log("Known:",Object.keys(known.orders).length,
            "Closed:",Object.keys(closed.orders).length, [known.offset,closed.offset]);
	if(Object.keys(known.orders).length > Object.keys(closed.orders).length)
            Object.assign(closed,known);
        while(count > 0 && offset > -1) {
            let mixed = await bot.kapi(['ClosedOrders',{ofs:offset, closetime:'close'}]),
		total = mixed.result.count;
            if(mixed.error.length > 0) {
                console.log("Errors:\n",mixed.error.join("\n"));
            }
            console.log("At",offset,"of",total,"results.");
            // If more orders closed since our previous call, they will
            //  push everything further down the list and cause some old
            //  orders to be reported again.  These duplicates do not
            //  cause a problem when the list of closed orders is an object
            //  because the later assignments to the TxID (key) overwrite
            //  the earlier ones.
            // ClosedOrders might return pending, open, canceled, and expired
            //  orders too.  Remove them.
            // ------------------------------------------------------
            let executed = Object.entries(mixed.result.closed).filter((e) =>
                (e[1].status == 'closed')),
                rCount = Object.keys(mixed.result.closed).length,
		elen = executed.length;
	    offset += rCount;
	    // If offset >= total, we have collected the earliest order
		// so we can collect only new ones (returned first) from now
		// on. This is what it means when offset on disk is -1.
            // If known.offset is -1 then the only orders left to collect
            // are the newest ones, and if the first one we get is already
            // in known.orders, then there are no new ones and we have everything.
            // -------------------------------------------------------------------
	    closed.offset = ((offset >= total 
                || (known.orders.hasOwnProperty(executed[0][0]) && known.offset == -1))
                ? -1 : offset);
            count -= elen;
            if(elen > 0) {
                console.log("Retrieved",elen,"executed orders and",executed[0][0],
                    (known.orders.hasOwnProperty(executed[0][0])?'is':'is not'),"known.");
            }
            const KRAKEN_GCO_MAX = 50;
            Object.assign(closed.orders, Object.fromEntries(executed));
	    if(rCount < KRAKEN_GCO_MAX) {  // We must have reached the earliest order.
		if(closed.offset > -1) // Should be impossible, so...
		    throw(offset+" still < "+total+" API returns < 50");
		console.log("Total Executed orders collected: "
                    +(Object.keys(closed.orders).length));
		count = 0;
            } else if(Object.keys(known.orders || {}).includes(executed[elen-1][0])
                && (known.offset == -1 || offset < known.offset) ) {
                // Last order retrieved already on disk
                console.log("Jumping to the end... ("+known.offset+")");
		offset = known.offset;	// so jump to the end.
                closed.offset = offset;
            } else {    // We are now collecting the oldest orders.
                console.log("Collecting the oldest orders...");
                if(known.offset == -1) offset = -1; 
//console.log("I just set offset (reports.js file scope) to -1",
//    " because:[KeyLen TXIDs don't include ee0 & (ko=-1 or is > o)",
//    {KeyLen: Object.keys(known.orders || {}).length,
//    ee0: executed[elen-1][0], ko: known.offset, o:offset});
            }
        }
	closed = keyOrder(closed);
        // We set offset to 0 when done because we must ask for more
        // orders since some may have executed since the previous call.
        offset = offset == -1 ? 0 : offset;
        return closed;
    }

    // This function adds an iterator and the "forward" key to iterate
    //  through the orders property backwards or forwards.
    // ---------------------------------------------------------------
    function keyOrder(keyed, pattern = TxIDPattern) {
        keyed['forward'] = true;
        let keys = Object.keys(keyed.orders),
            K = keys.filter((x) => (pattern.test(x)));
        if( keys.length > K.length ) { // Keys that don't match.
            console.log("Ignoring",(keys.length - K.length,"non-matching keys:"));
            console.log(keys.filter((x) => (!pattern.test(x))));
        }

        K.sort((a,b) => (keyed.orders[a].closetm - keyed.orders[b].closetm));
        let Kr = K.toReversed();

        keyed.orders[Symbol.iterator] = function* () {
            for( const key of (keyed.forward ? K : Kr) ) yield key;
        }
        return keyed;
    }

    function yearStart() {
        const now = new Date();
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return yearStart.getTime();
    }

    // This ensures all orders have been retrieved
    //  and provides whatever information it can about the process.
    async function capGains() {
        let started = Date.now();
        let notBefore = yearStart();
        // Let's not go back before the beginning of the year
        while(closed[closed.length].opentm > notBefore/1000) {
            await getExecuted();
            if( Date.now() - started > 5 ) {
                console.log("I'm stopping after five seconds.");
                return;
            }
        }
        console.log("I've collected",closed.length,
            " orders, and that goes back to ",
            Date(closed[closed.length].opentm));
    }

    return {getExecuted, capGains};
}

module.exports = Reports;
