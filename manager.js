#!/usr/bin/env node
 
function Manager(config) {
    if( config.man ) return config.man;
    let web;
    let cmdList = [];
    let auto = 0;
    let delay = 60;
    let portfolio = false;
    let autoOnHold = false;
    const {bot, Savings, Web, Balancer} = config;
    // eslint-disable-next-line no-param-reassign
 
    function catcher(line,err) {
        // if(/ETIMEDOUT/.test(err.code)) return; // We can ignore timeout errors.
        console.log(`Line ${line};\n`,err);
        clearInterval(auto);
        auto = 0;
    }

    async function setAlloc(alloc) {
        let answer;
        // eslint-disable-next-line no-cond-assign
        while( (answer = prompt(
            "Enter N or a ticker to adjust this allocation: ").toUpperCase())
            !== "N") {
            if(bot.getAlts()[answer]) answer = bot.getAlts()[answer];
            const tik = alloc.get(answer);
//    console.log("Found",tik);
            if(typeof(tik) === 'undefined') {
                console.log("Enter a ticker from the list above"
                    + " or N to quit managing your allocation: ");
            } else if(portfolio.Numeraire === answer) {
                console.log(`${answer  } is your default asset.  Its allocation` 
                    + ` will be whatever is left over after all the others are set.\n`);
                // eslint-disable-next-line no-cond-assign
                if((answer = prompt("Enter your new default asset,"
                    + " or OK to continue: ").toUpperCase()) !== "OK") {
                    if(bot.Numeraires.includes(answer)) {
                        alloc.setNumeraire(answer);
                    } else {
                        console.log(`${answer} is not supported as a default asset.`);
                    }
                }
            } else {
                answer = prompt(`Change ${answer} to what percentage `
                    + `(0.0-100.0 or use + or - for relative changes): `);
                if(Number.isNaN(answer)) console.log("Only numbers work here.");
                else if(['+','-'].includes(answer[0])) {
                    answer = Number(answer) + 100*tik.target;
                }
                if(!Number.isNaN(answer)) alloc.addAsset(tik.ticker, answer/100);
            }
            console.log(alloc.list());
            portfolio.Allocation = alloc;
            bot.save();
        }
    }

    /*
       Note that handleArgs handles string arguments as collected from process.stdin.
       This means that true and 1, as args, are strings, not a boolean and a number.
     */
    async function handleArgs(args, uref = 0) {
        let buysell; let xmrbtc; let price; let amt; let posP;
        const p = portfolio;
        if(/^(buy|sell)$/.test(args[0])) {
            [buysell,xmrbtc,price,amt,posP] = args;
            const pair = bot.findPair(xmrbtc, p.Numeraire, -1);
            if(pair) xmrbtc = pair[1].base;
            if( typeof(p[xmrbtc]) === 'undefined' ) {
                // Try the asset's altname
                // -----------------------
                if(typeof(p[bot.getAlts()[xmrbtc]]) === 'undefined') {
                    console.log(`${xmrbtc} is not a recognized symbol.  Try 'asset' command.`);
                    return;
                }
                console.log("Using",bot.getAlts()[xmrbtc],"instead of",xmrbtc);
                xmrbtc = bot.getAlts()[xmrbtc];
            }
            const total=price*amt;
            if(total > 100000) {
                console.log(`${total} is too much for code to ${buysell}`);
                return;
            }

            // console.log(buysell+"ing "+amt+xmrbtc+" for "+price+".");

            // Do we need leverage?
            // --------------------
            const lev = bot.getLev(p,buysell,price,amt,xmrbtc,posP);
            let cPrice = !Number.isNaN(p.G[uref]) 
                ? p.G[uref][buysell==='buy'?'sell':'buy'] : 0;
            // Without a record of a closing price, use the last one we found.
            // ---------------------------------------------------------------
            if(!cPrice) [,cPrice] = p[xmrbtc];
            // When passing 1 as close, it will mean close at 1 (if Risky) 
            // or at current price (without Risky)
            // -----------------------------------------------------------
            // eslint-disable-next-line no-nested-ternary
            const closeO = posP ? (posP !== 'true'            // posP is a number, not the boolean
                ? (posP !== '1' || bot.risky ? posP : cPrice)   // use the number unless it's 1 and Risky is off
                : cPrice) : null;                           // NaN, so current price or nothing.
            const ret = await bot.order(buysell,pair[0],price,amt,lev,uref,closeO);
            console.log(`New order: ${ret}`);
            
        } else if(args[0] === 'set') {
            await bot.set(p, args[1], args[2], args[3]);
        } else if(args[0] === 'reset') {
            // eslint-disable-next-line no-param-reassign
            p.G = [];
            await bot.listOpens();
        } else if(args[0] === 'delev') {
            await bot.deleverage(p.O,args[1]-1);
        } else if(args[0] === 'addlev') {
            await bot.deleverage(p.O,args[1]-1,true);
        } else if(args[0] === 'refnum') {
            await bot.refnum(p.O,args[1]-1,args[2]);
        } else if(args[0] === 'list') {
            await bot.list(args);
        } else if(/^(less|more)$/.test(args[0])) {
            await bot.lessmore(args[0]==='less',args[1]-1,args[2],args[3]==='all');
        } else if(args[0] === 'asset') {
            if(args.length === 1) {
                console.log("Usage: asset ticker units [label] ask");
                console.log(" or asset REMOVE ticker [label] ask");
                console.log(" or asset REMOVE ACCOUNT label ask");
                console.log("To avoid asking for confirmation, pass 'false' as ask.");
                return;
            }
            const label = args[3] ? args[3] : "default";
                let tkr = args[1] === 'REMOVE' ? args[2] : args[1];
                let account = p.Savings.find(a => a.label === label);
            if(bot.getAlts()[tkr]) tkr = bot.getAlts()[tkr];
            if(!account) {
                if(args[1] === 'REMOVE') {
                    console.log("Non-existent account:",label);
                    return;
                }
                if(Number.isNaN(args[2])) {
                    console.log(args[2],"is not a number.");
                    return;
                }
                account = Savings({
                    label,
                    assets:[{ticker:tkr,amount:Number(args[2])}],
                    AllocCon:config.AllocCon
                });
                console.log("Created new account, ", label);
                p.Savings.push(JSON.parse(account.save()));
               if(args[3]) account.labelMe(args[3]);
            } else {
                account = Savings({AllocCon:config.AllocCon, ...account});
            }
            if(args[1] === 'REMOVE') {
                if(args[2].toUpperCase() === 'ACCOUNT') {
                    const smaller = p.Savings.filter(x => x.label !== args[3]);
                    p.Savings = smaller;
                    bot.save();
                    console.log("Account",label,"has been removed.");
                } else {
                    account.remove(args[2]); // tkr might be different/an alt.
                    bot.save();
                }
                return;
            }
            if(Number.isNaN(args[2])) {
                console.log(args[2],"is not a number.");
                return;
            }
            if(account.updateAsset(args[1],Number(args[2]),args[4]!=='false')) {
                bot.save();
            }
        } else if(args[0] === 'assets') {
            let sav; const pnum = p.Numeraire;
            for(let h=0; h < p.Savings.length; h += 1) {
                sav = Savings({AllocCon:config.AllocCon, ...p.Savings[h]});
                if(!(args[1]) || sav.label === args[1])
                    console.log(h, sav.list());
                else if(args[1]) {
                    const a = sav.get(args[1]);
                    if( a > '' ) console.log(sav.label,a);
                }
            }
            // Include the assets on the Exchange
            // ----------------------------------
            sav = Savings({ label:'OnExchange', assets:
                [{ticker:pnum, amount:p[pnum][0]}],
                AllocCon: config.AllocCon});
        } else if(args[0] === 'allocation') {
            const d = await p.Allocation.getAllocation(true); let c; // Desired
            if(args[1]) {
                c = await p.Allocation.getAllocation(false, args[1].toLowerCase()==='fresh');  // Current
                if(args[1] === '?') { console.log("Usage: Allocation [cmd]\n"
                    + "If cmd is 'fresh' we compare the current allocation, after\n"
                    + "updating it, to the desired allocation.\n"
                    + "If cmd is missing, we compare the current allocation, without\n"
                    + "first updating it, to the desired allocation.\n"
                    + "Use 'allocate' to change your desired allocation.");
                }
            } else c = await p.Allocation.getAllocation(false, false);            
            const alisting = d
                ? d.list({name:'Now',alloc:c})
                : (`${c.list()  }Use allocate to set targets.`);
            if(!args[1] || args[1].toLowerCase() !== 'quiet') console.log(alisting);
            // eslint-disable-next-line consistent-return
            return {desired:d,current:c};
        } else if(args[0] === 'allocate') {
            let a = await p.Allocation.getAllocation(true);
            if(!args[1]) { 
                let old;
                console.log("This will let you start from scratch.\n"
                    +"Use 'allocate (Ticker) [+/-](amount)' to adjust and 'allocation' to\n"
                    +"see your current and desired allocations.\n");
                if(a) old = prompt("Erase current allocation (y/n)?")
                    .toLowerCase() === 'y';
                if(!a || old) a = await p.Allocation.getAllocation(false);
                console.log(a.list());
                await setAlloc(a);
            } else if(Number.isNaN(args[2]) || !bot.getTickers().includes(args[1])) {
                console.log(args[2],"isn't a number or",args[1],
                    "isn't a recognized ticker.");
            } else {
                const tkr = args[1];
                    amt = Number(args[2])/100;
                if(a === false) a = p.Allocation.getAllocation(false);
                if(amt<0 || args[2][0]==='+') { // Relative adjustment
                    const rel = a.get(tkr).target;
                    if(!Number.isNaN(rel)) amt += rel;
                }
                a.addAsset(tkr,amt);
                bot.save();
            }
        } else if(args[0] === 'balance') {
            if(args[1]) {
                const a = await p.Allocation.getAllocation(true);  // Get desired allocation.
                const b = Balancer(a);
                b.setTrades(args[1],args[2]?args[2].toUpperCase():''); // Tolerance, Ticker
            } else {
                console.log("Usage: balance tolerance [ticker]\n"
                    + "tolerance is 0.0000 - 1, indicating how far away\n"
                    + "from the target an asset can be before a trade is\n"
                    + "triggered.\n"
                    + "ticker is optional and only that asset will be\n"
                    + "set up if present.");
            }
        } else if(args[0] === 'adjust') {
            const d = await p.Allocation.getAllocation(true);
                const alloc = d.get(args[1]);
                const a = Number(args[2]); 
                const ppct = Number(args[3]); let t;
                const usage = "Usage: adjust ticker apct ppct\n" +
                    "apct is the percent of your allocation that you want\n" +
                    "to move into cash as the price of the asset goes up.\n" +
                    "ppct is the percent of the price over which you want\n" +
                    "to do it.";
            if(typeof(alloc) === 'undefined'
                || Number.isNaN(ppct) || Number.isNaN(a)) {
                console.log(usage);
            } else if(a<0||ppct<0||a>100*(1-alloc.target)||ppct>100) {
                console.log("apct must be between 0 and",100-100*alloc.target,
                    "and ppct must be between zero and 100.");
            } else {
                t = alloc.ticker;
                await d.adjust(t,a/100,ppct/100);
                await bot.save();
            }
        } else if(args[0] === 'limits') {
            if(args.length < 3 || Number.isNaN(args[1]) || Number.isNaN(args[2])) {
                console.log(`Usage: limits AtLeast AtMost\n` +
                    `The allocation command will make trades only if the\n` +
                    `amount in ${p.Numeraire} is at least the \n` +
                    `AtLeast amount and no more than the AtMost amount.\n` +
                    `If AtMost is -1, there is no upper limit (dangerous!).`);
            } else if(Number(args[1]) > Number(args[2]) && Number(args[2]) !== -1) {
                console.log("Doing nothing becuase you seem to have\n" +
                    "switched the arguments.");
            } else {
                p.limits = [Number(args[1]),Number(args[2])];
                bot.save();
            }
        } else if(args[0] === 'test') {
            // Put some test code here if you want
            // -----------------------------------
            const d = await p.Allocation.getAllocation(true);
            await d.adjust('XXMR', 0.05, 0.2);
        } else if(args[0] === "quit") { process.exit();
        } else if(/^(y|Y)/.test(prompt(`Try ${args[0]} raw?`))) {
            const raw = await bot.kapi(args);
            console.log(392,raw);
        } else {
            if(/^(y|Y)/.test(prompt(`Set process.TESTING to ${args[0]}?`))) {
                process.TESTING = (args[0] === 'notest' ? false : args[0]);
                const cv = prompt("Use caching?([Y]es/[N]o/[R]equired");
                process.USECACHE = { 
                    y:true, Y:true,
                    r: 'must', R: 'must'
                }[cv[0]] || false;
            }
            console.log("process.TESTING is",process.TESTING,
            "and caching",(process.USECACHE?"will":"will not"),"be used.");
        }
    }

    async function doCommands(cl=cmdList) {
        const cmds = cl.map((x) => x.trim());
            let cdx = 0; let kwsCheck;
        cmdList = [];   // So a throw doesn't repeat the command that caused it.
        autoOnHold = auto>0;
        
        console.log(`Got ${cmds.length} commands...`);
        while(cdx < cmds.length) try {
            const args = cmds[cdx].split(' ').map((x) => x.trim());
            cdx += 1;
            console.log(`...(${cdx})> ${args.join(' ')}`);
            // eslint-disable-next-line no-await-in-loop
            if(args[0] === 'kill') await bot.kill(args[1],portfolio.O);
	    	// eslint-disable-next-line no-await-in-loop
	    	else if(args[0] === "keys") { await bot.keys(); }
		    else if(args[0] === "ws") {
                if(kwsCheck) console.log(`Kraken WebSocket heartbeat at ${kwsCheck}`);
                if(!kwsCheck || (new Date()).valueOf() > 10000+kwsCheck.valueOf()) {
                    // openSocket();
                }
            } else if(args[0] === "report" || args[0] === "") {
                // eslint-disable-next-line no-await-in-loop
                await bot.report();
            } else if(/^(manual)$/.test(args[0])) {
                clearInterval(auto);
                auto = 0;
            } else if(args[0] === "auto") {
                clearInterval(auto);
                if(args[1]&&!Number.isNaN(args[1])) [,delay] = args;
                let counter = 2; // Wait 2 seconds before first run.
                // eslint-disable-next-line no-loop-func
                auto = setInterval(async () => {
                    counter -= 1;
                    if(counter > 0) {
                        if(!autoOnHold) {
                            await bot.report(false);
                        }
                        bot.showState(auto > 0 ? 'A' : '.');
                        counter = delay;
                    }
                },1000);
            } else if(args[0] === "risky") {
                // eslint-disable-next-line no-param-reassign
                bot.FLAGS.risky = !bot.FLAGS.risky;
                console.log(`Risky Mode is ${bot.FLAGS.risky
                    ? 'on - Experimental additions will be tried' : 'off'}`);
            } else if(args[0] === "safe") {
                // eslint-disable-next-line no-param-reassign
                bot.FLAGS.safe = !bot.FLAGS.safe;
                console.log(`Safe Mode is ${bot.FLAGS.safe
                    ? 'on - Orders will be displayed but not placed' : 'off'}`);
                if(process.TESTING && !bot.FLAGS.safe) {
                    // eslint-disable-next-line no-param-reassign, no-loop-func
                    setTimeout(() => {bot.FLAGS.safe=true;},1500);
                    console.log("...only for 1500ms.");
                }
            } else if(args[0] === "verbose") {
                bot.FLAGS.verbose = !bot.FLAGS.verbose;
                console.log(`Verbose is ${bot.FLAGS.verbose ? 'on' : 'off'}`);
            } else if(args[0] === 'margin') {
                // eslint-disable-next-line no-await-in-loop
                await bot.marginReport();
            } else if(args[0] === 'show') {
                if(args[2]) console.log(args[2],{value:portfolio[args[1]][args[2]]});
                else if(args[1]) console.log(args[1],{value:portfolio[args[1]]});
                else console.log({Portfolio:portfolio,bot});
            } else if(args[0] === 'web') {
                if(args[1]) {
                    if(args[1].toUpperCase() === 'ON') 
                        // eslint-disable-next-line no-unused-expressions
                        args[2]?web.start(args[2]):web.start();
                    else if(args[1].toUpperCase() === 'OFF') web.stop();
                } else {
                    console.log("Usage: web [on|off]\n"
                        + "This starts the web interface or stops it.");
                }
            } else {
                // eslint-disable-next-line no-await-in-loop
                return await handleArgs(args, 0);
            }
            // }
            // Wait a sec for the nonce
            // -------------------------
            // await bot.sleep(1000); (moved to kapi).
        } catch(e) {
            console.log(e,", so going manual.");
            clearInterval(auto);
            auto = 0; 
        }
        // console.log("Try CRTL-C while I sleep for a minute...");
        // await sleep(1000);
        autoOnHold = false;
        return true;
    }

    function listener() {
        let cmd = '';
        let waiter = 0;
        // clearInterval(auto);
        let data = '';
        while(data !== null) {
            cmd += data;
            data = process.stdin.read();
        }
        if(/^quit/.test(cmd)) {
            process.exit(0);
        } else if(/(\r|\n)$/.test(cmd)) {
            clearTimeout(waiter);
            waiter = setTimeout(async () => {
                // Do we need to stop this listener from 
                // listening while doCommands runs?
                if(cmdList.length > 0) {
                    try {
                        await doCommands();
                        bot.showState(auto > 0 ? 'A' : '.');
                        process.stdout.write('>');
                    } catch(e) {
                        console.log(e);
                        console.trace();
                    }
                }
                cmdList = [];
            },100);
            cmd.replace(/[\r\n]+/g,'\r').split('\r').forEach(e => cmdList.push(e));
            // That leaves one empty string at the end of cmdList.  Remove it:
            cmdList.pop();
            cmd = '';
        }
    }

    function ignore() { process.stdin.off('readable',listener); }

    function listen() {
        process.stdin.on('readable', listener);
    }

    async function init(pw = "") {
        if(this.already) return;
        process.stdin.setEncoding('utf8');

        if(!process.TESTING) {
            process.on('uncaughtException', (err) => {
                catcher(0,err);
            });
        }
        portfolio = await bot.init(pw);
        web = Web(config);
        await bot.report(true);
        if(!process.TESTING || process.argv.length > 2) listen();
        else {
            console.log("42:",portfolio);
            this.already = true;
        }
        this.already = true;
    }

    function getAuto() { return auto>0 ? delay : -1; }

    // eslint-disable-next-line no-param-reassign
    config.man = { catcher, doCommands, init, ignore, getAuto };
    return config.man;
}
export default Manager;