function Reports(bot) {
    const TxIDPattern = /[0-9A-Z]{6}-[0-9A-Z]{5}-[0-9A-Z]{6}/; 
    const KRAKEN_GCO_MAX = 50;

    // This function will collect count executed orders in reverse chronological order,
	// first the most recent (ofs=0) and then earlier history (ofs from known).
    async function getExecuted(count, known = {}) {
        let offset = 0, // Since the last call, one or more orders may have executed.
            midway = false,
            closed = {offset:0, forward:false, orders:{}};
        closed.hasFirst = known.hasFirst || known.offset == -1;
        if(!known.hasOwnProperty('orders')) { // Is old format or not collected yet
            known = {offset:0, forward:false, orders:{}};
            console.log("known passed has no 'orders' property.");
        }
        console.log("Known:",Object.keys(known.orders).length,
            "Closed:",Object.keys(closed.orders).length, [known.offset,closed.offset]);
	if(Object.keys(known.orders).length > Object.keys(closed.orders).length)
            Object.assign(closed,known);
        while(count > 0) {
            console.log("Known:",Object.keys(known.orders).length,
                "Closed:",Object.keys(closed.orders).length, [known.offset,closed.offset]);
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
                elen = executed.length,
                earliest = undefined != known.orders[executed[elen-1][0]],
                latest   = undefined != known.orders[executed[0][0]];
	    offset += rCount;
	    closed.offset = offset;
            count -= elen;
            if(elen > 0) {
                console.log("Retrieved",elen,"executed orders and most recent,",
                    executed[0][0],(latest ? 'is' : 'is not'),"known, and oldest,",
                    executed[elen-1][0],(earliest ? 'is' : 'is not'),"known.");
            }
            Object.assign(closed.orders, Object.fromEntries(executed));
            if(!closed.hasFirst) {  // But do we have the latest yet?
                if(rCount < KRAKEN_GCO_MAX) {  // We must have reached the earliest order.
                    if(closed.offset < total) // Should be impossible, so...
                        throw(offset+" still < "+total+" API returns < 50");
                    console.log("Total Executed orders collected: "
                        +(Object.keys(closed.orders).length));
                    closed.hasFirst = true;
                    break;
                } else if(earliest && !midway) {  // The earliest order was already collected.
                    console.log("Jumping to the end... ("+known.offset+")");
                    offset = known.offset;	// so jump to the end.
                    closed.offset = offset;
                    midway = true;
                }
            } else {
                console.log("We already have your earliest orders.");
                if(earliest) break;  // All new orders collected.
            }
        }
	closed = keyOrder(closed);
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
