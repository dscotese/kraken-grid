#!/usr/bin/env node
function Manager(b) {
    const prompt = require('prompt-sync')({sigint: true});
    const newAlloc = require('./allocation.js');
    const Bot = require('./bot.js');
    const Balancer = require('./balancer.js');
    const Web = require('./web.js');
    // const HServer = 
    let bot = b,
        web,
        cmdList = [],
        waiter = 0,
        auto = 0,
        delay = 60,
        auto_on_hold = false,
        portfolio = false,
        listener = null,
        savings = null,
        myTotal = 0;


    function run() {
        doCommands(['report']); //.catch((err) => { catcher(578,err); });
        console.log("Safemode is on.  `safe` toggles it.");
    }

    process.stdin.setEncoding('utf8');

    if(!process.TESTING) {
        process.on('uncaughtException', function (err) {
            catcher(0,err);
        });
    }

    async function init(pw = "") {
        if(this.already) return;
        Manager.s = this;
        portfolio = await bot.init(pw);
        web = Web(this);
        savings = require('./savings.js');
        /*if(!process.TESTING)*/ await bot.report(true);
        savings().setTickers(Bot.tickers);
        if(!process.TESTING) listen();
        else {
            console.log("42:",portfolio);
            this.already = true;
            return portfolio;
        }
        this.already = true;
    }

    function ignore() { process.stdin.removeListener(listener); }

    function listen() {
        let cmd = '';
        listener = process.stdin.on('readable', () => {
            // clearInterval(auto);
            let data = '';
            while(null != (data = process.stdin.read())) cmd += data;
 //         console.log("Last char in cmd was: ", cmd.charCodeAt(cmd.length-1));
 //       });
 //       process.stdin.on('end', () => {
            if(/^quit/.test(cmd)) {
                process.exit(0);
            } else if(/(\r|\n)$/.test(cmd)) {
                clearTimeout(waiter);
                waiter = setTimeout(async () => {
                    // Do we need to stop this listener from 
                    // listening while doCommands runs?
                    if(cmdList.length > 0) {
                        await doCommands();
                        bot.showState(auto > 0 ? 'A' : '.');
                        process.stdout.write('>');
                    }
                    cmdList = [];
                },100);
                cmd.replace(/[\r\n]+/g,'\r').split('\r').forEach(e => cmdList.push(e));
                // That leaves one empty string at the end of cmdList.  Remove it:
                cmdList.pop();
                cmd = '';
            }
        });
    }

    function catcher(line,err) {
        //if(/ETIMEDOUT/.test(err.code)) return; // We can ignore timeout errors.
        console.log("Line "+line+";\n",err);
        clearInterval(auto);
        auto = 0;
    }

    function whoami() { return whoami.caller.name; }

    /*
       Note that handleArgs handles string arguments as collected from process.stdin.
       This means that true and 1, as args, are strings, not a boolean and a number.
     */
    async function handleArgs(bot, portfolio, args, uref = 0) {
        if(['args',whoami()].includes(process.TESTING))
            console.log(whoami(),"called with ",arguments);
        let buysell,xmrbtc,price,amt,posP;
        if(/^(buy|sell)$/.test(args[0])) {
            let pair;
            [buysell,xmrbtc,price,amt,posP] = args;
            pair = Bot.findPair(xmrbtc, portfolio.Numerairei, -1);
            if(pair) xmrbtc = pair[1].base;
            if( 'undefined' == typeof(portfolio[xmrbtc]) ) {
                // Try the asset's altname
                // -----------------------
                if('undefined' == typeof(portfolio[Bot.alts[xmrbtc]]))
                    throw new Error(xmrbtc+" is not a recognized symbol.  Try 'asset' command.");
                console.log("Using",Bot.alts[xmrbtc],"instead of",xmrbtc);
                xmrbtc = Bot.alts[xmrbtc];
            }
            let total=price*amt;
            if(total > 100000) return total+" is too much for code to "+buysell;

            // console.log(buysell+"ing "+amt+xmrbtc+" for "+price+".");

            // Do we need leverage?
            // --------------------
            let lev = bot.getLev(portfolio,buysell,price,amt,xmrbtc,posP);
            let cPrice = !isNaN(portfolio['G'][uref]) 
                ? portfolio['G'][uref][buysell=='buy'?'sell':'buy'] : 0;
            // Without a record of a closing price, use the last one we found.
            // ---------------------------------------------------------------
            if(!cPrice) cPrice = portfolio[xmrbtc][1];
            // When passing 1 as close, it will mean close at 1 (if Risky) 
            // or at current price (without Risky)
            // -----------------------------------------------------------
            let closeO = posP ? (posP !== 'true'            // posP is a number, not the boolean
                ? (posP !== '1' || bot.risky ? posP : cPrice)   // use the number unless it's 1 and Risky is off
                : cPrice) : null;                           // NaN, so current price or nothing.
            let ret = await bot.order(buysell,pair[0],price,amt,lev,uref,closeO);
            console.log("New order: "+ret);
            return;
        } else if(args[0] == 'set') {
            await bot.set(portfolio, args[1], args[2], args[3]);
        } else if(args[0] == 'reset') {
            portfolio['G'] = [];
            await bot.listOpens(portfolio);
        } else if(args[0] == 'delev') {
            await bot.deleverage(portfolio['O'],args[1]-1);
        } else if(args[0] == 'addlev') {
            await bot.deleverage(portfolio['O'],args[1]-1,true);
        } else if(args[0] == 'refnum') {
            await bot.refnum(portfolio['O'],args[1]-1,args[2]);
        } else if(args[0] == 'list') {
            await bot.list(args);
        } else if(/^(less|more)$/.test(args[0])) {
            await bot.lessmore('less'==args[0],args[1]-1,args[2],'all'==args[3]);
        } else if(args[0] == 'asset') {
            if(args.length == 1) {
                console.log("Usage: asset ticker units [label] ask");
                console.log(" or asset REMOVE ticker [label] ask");
                console.log(" or asset REMOVE ACCOUNT label ask");
                console.log("To avoid asking for confirmation, pass 'false' as ask.");
                return;
            }
            let label = args[3] ? args[3] : "default",
                tkr = 'REMOVE' == args[1] ? args[2] : args[1],
                account = portfolio.Savings.find(a => a.label == label);
            if(Bot.alts[tkr]) tkr = Bot.alts[tkr];
            if(!account) {
                if('REMOVE' == args[1]) {
                    console.log("Non-existent account:",label);
                    return;
                }
                account = savings({
                    label:label,
                    assets:[{ticker:tkr,amount:Number(args[2])}]
                });
                console.log("Created new account, ", label);
                portfolio.Savings.push(JSON.parse(account.save()));
               if(args[3]) account.labelMe(args[3]);
            } else {
                account = savings(account);
            }
            if('REMOVE' == args[1]) {
                if('ACCOUNT' == args[2].toUpperCase()) {
                    let smaller = portfolio.Savings.filter(x => x.label != args[3]);
                    portfolio.Savings = smaller;
                    bot.save();
                    console.log("Account",label,"has been removed.");
                } else {
                    account.remove(args[2]); //tkr might be different/an alt.
                    bot.save();
                }
                return;
            }
            if(account.updateAsset(args[1],Number(args[2]),args[4]!=='false')) {
                bot.save();
            }
        } else if(args[0] == 'assets') {
            let sav,pnum = portfolio.Numeraire;
                ret = portfolio.Savings.length + ': ';
            for(h=0;h < portfolio.Savings.length; ++h) {
                sav = savings(portfolio.Savings[h]);
                if(!(args[1]) || sav.label == args[1])
                    console.log(h, sav.list());
                else if(args[1]) {
                    let a = sav.get(args[1]);
                    if( a > '' ) console.log(sav.label,a);
                }
            }
            // Include the assets on the Exchange
            // ----------------------------------
            sav = savings({ label:'OnExchange', assets:
                [{ticker:pnum, amount:portfolio[pnum][0]}]});
            return ret;
        } else if(args[0] == 'allocation') {
            let d = await getAllocation(true),c; // Desired
            if(args[1]) {
                c = await getAllocation(false, args[1].toLowerCase()=='fresh');  // Current
                if('?' == args[1]) { console.log("Usage: Allocation [cmd]\n"
                    + "If cmd is 'fresh' we compare the current allocation, after\n"
                    + "updating it, to the desired allocation.\n"
                    + "If cmd is missing, we compare the current allocation, without\n"
                    + "first updating it, to the desired allocation.\n"
                    + "Use 'allocate' to change your desired allocation.");
                }
            } else c = await getAllocation(false, false);            
            let alisting = d
                ? d.list({name:'Now',alloc:c})
                : (c.list() + "Use allocate to set targets.");
            console.log(alisting);
            return {desired:d,current:c};
        } else if(args[0] == 'allocate') {
            if(!args[1]) { 
                console.log("This will let you start from scratch.\n"
                    +"Use 'allocate (Ticker)' to adjust and 'allocation [X]' to\n"
                    +"see your current (X=c) or desired (no X) allocation.\n");
                let a = await getAllocation(true);
                if(a) old = prompt("Erase current allocation (y/n)?")
                    .toLowerCase() == 'y';
                if(!a || old) a = await getAllocation(false);
                console.log(a.list());
                await setAlloc(a);
            }
        } else if(args[0] == 'balance') {
            if(args[1]) {
                let a = await getAllocation(true);  // Get desired allocation.
                let b = Balancer(a);
                b.setTrades(args[1],args[2]?args[2].toUpperCase():''); // Tolerance, Ticker
            } else {
                console.log("Usage: balance tolerance [ticker]\n"
                    + "tolerance is 0.0000 - 1, indicating how far away\n"
                    + "from the target an asset can be before a trade is\n"
                    + "triggered.\n"
                    + "ticker is optional and only that asset will be\n"
                    + "set up if present.");
            }
        } else if(args[0] == 'adjust') {
            let d = await getAllocation(true),
                alloc = d.get(args[1]),
                ctargp = 100*d.get(0).target,
                a = Number(args[2]), 
                p = Number(args[3]), t,
                usage = "Usage: adjust ticker apct ppct\n" +
                    "apct is the percent of your allocation that you want\n" +
                    "to move into cash as the price of the asset goes up.\n" +
                    "ppct is the percent of the price over which you want\n" +
                    "to do it.";
            if('undefined' == typeof(alloc)
                || isNaN(p) || isNaN(a)) {
                console.log(usage);
            } else if(a<0||p<0||a>100*alloc.target||p>100) {
                console.log("apct must be between 0 and",100*alloc.target,
                    "and ppct must be between zero and 100.");
            } else {
                t = alloc.ticker;
                await d.adjust(t,a/100,p/100);
                await bot.save();
            }
        } else if(args[0] == 'limits') {
            if(args.length < 3 || isNaN(args[1]) || isNaN(args[2])) {
                console.log("Usage: limits AtLeast AtMost\n" +
                    "The allocation command will make trades only if the\n" +
                    "amount in "+portfolio.Numeraire+" is at least the \n" +
                    "AtLeast amount and no more than the AtMost amount.\n" +
                    "If AtMost is -1, there is no upper limit (dangerous!).");
            } else if(Number(args[1]) > Number(args[2]) && -1 != Number(args[2])) {
                console.log("Doing nothing becuase you seem to have\n" +
                    "switched the arguments.");
            } else {
                portfolio.limits = [Number(args[1]),Number(args[2])];
                bot.save();
            }
        } else if(args[0] == 'test') {
            // Put some test code here if you want
            // -----------------------------------
            let d = await getAllocation(true);
            await d.adjust('XXMR', 0.05, 0.2);
        } else if(/^(y|Y)/.test(prompt("Try "+args[0]+" raw?"))) {
            let raw = await bot.kapi(args);
            console.log(392,raw);
        } else {
            process.TESTING = ('notest' == args[0] ? false : args[0]);
            process.USECACHE = ('nocache' == args[0] ? false : process.TESTING);
            console.log("process.TESTING set to",process.TESTING,
                "and caching",(process.USECACHE?"will":"will not"),"be used.");
        }
    }

    async function doCommands(cl=cmdList) {
        let cmds = cl.map((x) => { return x.trim(); }),
            cdx = 0, ret = false;
        cmdList = [];   // So a throw doesn't repeat the command that caused it.
        auto_on_hold = auto>0;
        
        console.log("Got "+(cmds.length)+" commands...");
        while(cdx < cmds.length) {
            let args = cmds[cdx++].split(' ').map((x) => { return x.trim(); });
            console.log("...("+cdx+")> "+args.join(' '));
            //try {
            if(args[0] == 'kill') await bot.kill(args[1],bot.portfolio['O']);
	    	else if(args[0] == "keys") { await bot.keys(); }
		    else if(args[0] == "ws") {
                if(kwsCheck) console.log("Kraken WebSocket heartbeat at "+kwsCheck);
                if(!kwsCheck || (new Date()).valueOf() > 10000+kwsCheck.valueOf()) {
                    openSocket();
                }
            } else if(args[0] == "report" || args[0] == "") {
                await bot.report();
            } else if(/^(manual)$/.test(args[0])) {
                clearInterval(auto);
                auto = 0;
            } else if(args[0] == "auto") {
                clearInterval(auto);
                if(args[1]&&!isNaN(args[1])) delay = args[1];
                let counter = 2; // Wait 2 seconds before first run.
                auto = setInterval(async function() {
                    if(0 == --counter) {
                        if(!auto_on_hold) {
                            await bot.report(false);
                        }
                        bot.showState(auto > 0 ? 'A' : '.');
                        counter = delay;
                    }
                },1000);
            } else if(args[0] == "risky") {
                bot.FLAGS.risky = !bot.FLAGS.risky;
                console.log("Risky Mode is "+(bot.FLAGS.risky
                    ? 'on - Experimental additions will be tried' : 'off'));
            } else if(args[0] == "safe") {
                bot.FLAGS.safe = !bot.FLAGS.safe;
                console.log("Safe Mode is "+(bot.FLAGS.safe
                    ? 'on - Orders will be displayed but not placed' : 'off'));
                if(process.TESTING && !bot.FLAGS.safe) {
                    setTimeout(() => {bot.FLAGS.safe=true;},1500);
                    console.log("...only for 1500ms.");
                }
            } else if(args[0] == "verbose") {
                bot.FLAGS.verbose = !bot.FLAGS.verbose;
                console.log("Verbose is "+(bot.FLAGS.verbose ? 'on' : 'off'));
            } else if(args[0] == 'margin') {
                await bot.marginReport();
            } else if(args[0] == 'show') {
                if(args[1]) console.log(args[1],{value:bot.portfolio[args[1]]});
                else console.log({Portfolio:bot.portfolio,Bot});
            } else if(args[0] == 'web') {
                if(args[1]) {
                    if(args[1].toUpperCase() == 'ON') web.start();
                    else if(args[1].toUpperCase() == 'OFF') web.stop();
                } else {
                    console.log("Usage: web [on|off]\n"
                        + "This starts the web interface or stops it.");
                }
            } else {
                ret = await handleArgs(bot, bot.portfolio, args, 0);
                console.log(ret);
            }
            //}
            // Wait a sec for the nonce
            // -------------------------
            // await bot.sleep(1000); (moved to kapi).
        }
        //console.log("Try CRTL-C while I sleep for a minute...");
        //await sleep(1000);
        auto_on_hold = false;
        return ret;
    }

    // By default this returns the current allocation.
    // When desired is true, it returns the desired
    //   allocation or false if there isn't one yet.
    // ------------------------------------------------------ 
    async function getAllocation(desired = false, refresh = true) {
        if(['args',whoami()].includes(process.TESTING))
            console.log(whoami(),"called with ",arguments);
        if(desired) {
            return (portfolio.Allocation && portfolio.Allocation.size() > 0)
                ? portfolio.Allocation
                : false;
        }
        if(refresh) { 
            console.log("350 refreshing...");
            await Bot.s.report(false);
        }
        let total = savings();
        let sym;
        // Add savings to total.
        // ---------------------
        portfolio.Savings.forEach(sav => {total.add(savings(sav))});
        
    // console.log(total.list("OffExchange", true));
        // Add Exchange assets to total.
        // -----------------------------
        for(sym in portfolio) {
            if(total.validTicker(sym)) {
                let tndx = (sym==portfolio.Numeraire?0:3);
                total.updateAsset(sym,portfolio[sym][tndx],false,true);
            } // else console.log("Skipping",sym);
        }
        let ret = await total.getAlloc(portfolio.Numeraire || 'ZUSD',
            bot.numerairesFromPairs());
        myTotal = total.getTotal();
        return ret;
    }

    function getTotal() { return myTotal; }

    async function setAlloc(alloc) {
        let answer;
        while( (answer = prompt(
            "Enter N or a ticker to adjust this allocation: ").toUpperCase())
            != "N") {
            if(Bot.alts[answer]) answer = Bot.alts[answer];
            let tik = alloc.get(answer);
//    console.log("Found",tik);
            if('undefined' == typeof(tik)) {
                console.log("Enter a ticker from the list above"
                    + " or N to quit managing your allocation: ");
            } else if(portfolio.Numeraire == answer) {
                console.log(answer + " is your default asset.  Its allocation" 
                    + " will be whatever is left over after all the others are set.\n");
                if("OK" != (answer = prompt("Enter your new default asset,"
                    + " or OK to continue: ").toUpperCase())) {
                    if(Bot.Numeraires.includes(answer)) {
                        alloc.setNumeraire(answer);
                    } else {
                        console.log(answer+" is not supported as a default asset.");
                    }
                }
            } else {
                answer = prompt("Change "+answer+" to what percentage "
                    + "(0.0-100.0 or use + or - for relative changes): ");
                if(isNaN(answer)) console.log("Only numbers work here.");
                else if(answer[0] == '+') {
                    answer = Number(answer) + tik.target;
                } else if(answer[0] == '-') {
                    answer = tik.target - Number(answer);
                }
                alloc.addAsset(tik.ticker, answer/100);
            }
            console.log(alloc.list());
            portfolio.Allocation = alloc;
            bot.save();
        }
    }

    return({ catcher, run, doCommands, getAllocation, 
             init, listen, ignore, getTotal });
}
module.exports = Manager;

