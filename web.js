const express = require('express');
const basicAuth = require("express-basic-auth");
const app = express();
const path = require("path");
const session = require('express-session');
const bodyParser = require('body-parser');
const Bot = require('./bot.js');
const fs = require('fs');
const Allocation = require('./allocation.js');
function Web(man) {
    // const Savings = require('./savings.js');
    let server = false,
        log_original = console.log,
        bot = Bot.s,
        sigdig = Allocation.sigdig,
        tkrs=[]; // Associative array of totals for ticker indices.
    let logged = "<!-- init at 10 -->";

    function log() {
        let a = Array.from(arguments);
        logged += "\n"+a.join(' ');
        // a.length = a.length - 2; // callee and Symbol
        log_original("Web!",...a);
    }

    // Initialize
    const host = 'localhost';
    const port = process.TESTING ? 8001 : 8000;
    app.set('trust proxy', 1); // trust first proxy
    app.use(session({
	secret: '537R37',
	resave: false,
	saveUninitialized: false,
	cookie: { secure: false }
	}));

    app.use("/js",express.static(path.join(__dirname, 'static')));
    app.use("/img",express.static(path.join(__dirname, 'static')));
    app.use(basicAuth({
        challenge: true,
        users: { 'admin': Bot.PW }
    }));
    function stop() { 
        if(server) server.close();
        server = false;
        if(log_original) console.log = log_original;
        console.log("WebServer is off."); 
    }
    function start(pport = port) { 
        if(server) server.close();
        server = app.listen(pport,(e) => { if(e) console.log("HTTP Server failed:",e); });
        // Trap the console.log function
        console.log = log;
        log_original(`Server is running on http://${host}:${pport}`); 
    }
    function address() { return server ? server.address : false; }

    app.use(bodyParser.urlencoded({ extended: false }));

    app.get('/', async (req, res, next) => {
        logged = ""; //"<!-- " + {req,res,next} + " -->";
        let tol = typeof(req.body.tol) == 'undefined' ? "0.025" : req.body.tol;
/*        res.write(head() + Documentation() + AssetsTable() 
            + await AllocTable(tol));
        marshalOrders(res);
        res.write("\n<div id='pie'></div>");
*/
        res.write(head() + Documentation() 
            + "<div id='GDiv'><canvas id='myCanvas'>"
            + "Your browser doesn't support the HTML5 canvas.</canvas>"
            + "</div><div id='LDiv'></div><div id='RDiv'></div>");
        res.end();

        logged = "<!-- Reset at 63 -->";
        next();
    });

    app.get('/data', async (req, res, next) => {
        logged = "Reset at 73";
        // Report called recently enough if on auto
        // ----------------------------------------
        if( man.getAuto() == -1 ) await bot.report(false);
        // I planned to remove AssetsTable, but it creates the tkrs array.
        // ---------------------------------------------------------------
        AssetsTable(); // Called for side-effect of collecting tkrs from savings.
        let [current,desired,adjust,ranges] = await bot.portfolio.Allocation.Allocations(tkrs),
        tt = {};
        Array.from(bot.portfolio.Tickers)
            .forEach((t)=>{tt[t]=bot.portfolio[t];
        });
        // Include tickers not on the exchange:
        // ------------------------------------
        await Promise.all(
            Object.keys(tkrs).filter((k) => { return !Object.keys(tt).includes(k); })
            .map(async (t) => {
                let p = await bot.getPrice(t);
                tt[t] = [tkrs[t],p];
            })
        );
        let refresh_period = man.getAuto(),
            orderedClosed = Object.entries(bot.portfolio.Closed.orders)
                .sort((a,b) => {return a[1].closetm - b[1].closetm;});
        res.send(JSON.stringify({
            orders:  bot.portfolio.O,
            grid:    bot.portfolio.G,
            savings: bot.portfolio.Savings,
            exsaves: bot.ExchangeSavings(),
            numer:   bot.portfolio.Numeraire,
            tickers: tt,
            total:   man.getTotal(),
            current: current,
            desired: desired,
            adjust:  adjust,
            ranges:  ranges,
            FLAGS: bot.FLAGS,
            refresh_period: refresh_period,
            closed: orderedClosed.slice(-5)
        }));
        // console.log("Sent Closed:", Object.entries(bot.portfolio.Closed.orders).slice(-5));
    });

    function tag(name,inner) { 
        return '<'+name+'>'+inner+'</'+name+'>';
    }

    function Documentation() {
        let rf = fs.readFileSync("./README.md",{encoding:'utf8'}); //,
//            readme = rf.substr(rf.lastIndexOf("## Usage"));
        return "<div id='Doc'><md-block>"+rf+"</md-block></div>";
    }

    app.post('/', async (req, res, next) => {
        let cmd = [ req.body.data ];
        console.log = log; 
        logged = "<!-- Reset at 119 -->";
        await man.doCommands( cmd );
    // console.log( "Received "+cmd);
        res.send(logged);
        console.log = log_original;
        next();
    });

    function getJQ() { 
        ret = "<script type='text/javascript'" +
            "src='http://code.jquery.com/jquery-latest.min.js'></script>\n";
        return ret;
    }

    function head(whatElse='') {return "<!DOCTYPE html><head>" + getJQ()
        + "<script type='module' src='/js/md-block.js'></script>\n"
        + "<script type='text/javascript' src='/js/gallocation.js' defer></script>\n"
        + "<script type='text/javascript' src='/js/imgByKtick.js'></script>\n"
        + "<script type='text/javascript' src='/js/client.js' defer></script>\n"
        + "<link rel='stylesheet' href='/js/main.css'>\n"
        + whatElse + "</head>\n"; }

    function weblink(tkr) {
        if(tkr == bot.portfolio.Numeraire) return bot.portfolio.Numeraire;
        return "<a href='https://trade.kraken.com/charts/KRAKEN:" +
            (tkr[0] == 'X' && tkr.length == 4
                ? tkr.substr(1) : tkr) +
            "-" + bot.portfolio.Numeraire.substr(1)
            +"' target='chart'>"+tkr+"</a>";
    }

    function AssetsTable() {
        let Savs = bot.portfolio.Savings,assets,
            total = man.getTotal(),
            tbody = "",
            ktks = tkrs ? Object.keys(tkrs) : [],
            ret = "",rows = [], // rows is an associative array of object arrays.
            tkr,amt,ki,label,tkrl,sav; // ktks is "Known Tickers"
        rows[''] = [{key:'AAAA',val:"<th title='Total Value'>"
            +sigdig(total,10,2)+"</th>"}].concat(ktks.map((e,i,a) => { 
                return { key:e, val:"<th>"+weblink(e)+"</th>" }; }));
        // Add exchange assets to list of "Savings Accounts"
        for(t in tkrs) { tkrs[t] = 0; };
        for(h = 0; h <= Savs.length; ++h) {
            ki = 0;
            sav = h == Savs.length
                ? bot.ExchangeSavings()
                : Savs[h];
            label = sav.label;
            assets = sav.assets.sort((a,b)=>{return a.ticker<b.ticker?-1:1;});
            rows[label] = [{key:'AAAA',val:"<th>"+label+"</th>"}];
            for(a = 0; a < assets.length; ++a) {
                [tkr,amt] = [assets[a].ticker,assets[a].amount];
                rows[label].push({key:tkr,
                    val:"<td tkr='"+tkr+"' acct='"+label+"' amt='"+amt+"'>"+amt+"</td>"});
                if(isNaN(tkrs[tkr])) {
                    tkrs[tkr]=amt;          // Initialized.
                    rows[''].push({key:tkr, val:"<th>" + weblink(tkr) + "</th>"});
                    ktks.push(tkr);
                    ki += 1;
                } else tkrs[tkr] += amt;    // Totals for ticker indices.
            }
        }
        rows['ZTotal'] = [{key:'AAAA',val:"<th>Totals</th>"}];
        ktks = ktks.sort();
        for(t of ktks) rows['ZTotal'].push({key:t,val:"<th>"+sigdig(tkrs[t],8,2)+"</th>"});
        for(r in rows) { 
            rows[r].sort((a,b)=> { return a.key<b.key ? -1 : 1; });
            let asString = "",rs;
            ki = 0;
            for(s in rows[r]) { 
                rs = rows[r][s];
                if(rs.key != 'AAAA') {
                    while(ki<ktks.length && ktks[ki++] != rs.key) asString += "<td></td>";
                }
                asString += rs.val;
            }
            // <td>s needed at the end
            let tail = ktks.length - ktks.findIndex(e=>{return e==rows[r].at(-1).key;});
            asString += "<td></td>".repeat(tail-1);
            tbody += "<tr>" + asString + "</tr>\n";
        }
        ret = "<div><table id='assets'>"+tbody+"</table></div>";
        return ret;
    }

    function table(object) {
        ret = "<pre>" + JSON.stringify(object) + "</pre>";
        return ret;
    }

    function askFor(q,t) {
        return "<form method='post' action='/login'>Password: <input name='"+q+"' type='"+t+"'/>"
            +"</form>";
    }

    return {start,stop,address};
}
module.exports = Web;
