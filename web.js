const express = require('express');
const app = express();
const path = require("path");
const session = require('express-session');
const bodyParser = require('body-parser');
const Bot = require('./bot.js');
const fs = require('fs');
function Web(man) {
    const Savings = require('./savings.js');
    let BeOff = true,
        log_original = console.log,
        bot = Bot.s,
        sigdig = bot.portfolio.Allocation.sigdig,
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
    app.set('trust proxy', 1) // trust first proxy
    app.use(session({
        secret: '537R37',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));

    app.use((req,res,next) => { if(!BeOff) next(); });

    app.use("/js",express.static(path.join(__dirname, 'static')));

    function stop() { 
        BeOff = true; 
        if(log_original) console.log = log_original;
        console.log("WebServer is off."); 
    }
    function start() { 
        BeOff = false; 
        // Trap the console.log function
        console.log = log;
        log_original(`Server is running on http://${host}:${port}`); 
    }

    app.use(bodyParser.urlencoded({ extended: false }));

    app.post('/login', async function (req, res, next) {
        if(req.session.key) {
            console.log("Already logged in.");
            next();
            return;
        }
        let login = await man.init(req.body.password);
        if(login.key) {
            req.session.key = login.key;
            res.send("Key has been stored.");
            next();
        } else res.redirect('back');
    });

    app.get('/', async (req, res, next) => {
        logged = ""; //"<!-- " + {req,res,next} + " -->";
        let tol = typeof(req.body.tol) == 'undefined' ? "0.025" : req.body.tol;
        res.send(head() + AssetsTable() + '<hr/>' + await AllocTable(tol)
            + Documentation());
        logged = "<!-- Reset at 63 -->";
        next();
    });  

    let rf = fs.readFileSync("./README.md",{encoding:'utf8'});
    const readme = rf.substr(rf.lastIndexOf("## Usage"));
    function Documentation() {
        return "<div id='Doc'><md-block>"+readme+"</md-block><div>";
    }

    app.post('/', async (req, res, next) => {
        let cmd = [ req.body.data ];
        console.log = log; //logged = "<!-- Reset at 73 -->";
        await man.doCommands( cmd );
    // console.log( "Received "+cmd);
        res.send(logged);
        console.log = log_original;
    });

    function getJQ() { 
        ret = "<script type='text/javascript'" +
            "src='http://code.jquery.com/jquery-latest.min.js'></script>\n";
        return ret;
    }

    function head(whatElse='') {return "<!DOCTYPE html><head>" + getJQ()
        + "<script type='module' src='https://md-block.verou.me/md-block.js'></script>\n"
        + "<script type='text/javascript' src='/js/client.js' defer='defer'></script>\n"
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
                if(!tkrs[tkr]) {
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
        ret = "<table id='assets'>"+tbody+"</table>";
        return ret;
    }

    async function getAlloc(tkr,alloc) { 
        let ret = await alloc.atarg(tkr); //lloc.assets.find(a=>{return a.ticker==tkr;});
        return ret ? sigdig(100*ret,5,2) : 0;
    }

    async function AllocTable(tol) {
        let allocs = await man.doCommands(["allocation"]);
        let ret = "<table id='alloc'><tr><th colspan='"
            + (1+Object.keys(tkrs).length) 
            + "'>Allocation Last Update: " + bot.portfolio.lastUpdate
            + "</th></tr>\n<tr id='tkrs'><th id='tol' title='Balance Tolerance'>"+tol+"</th>",
            total = man.getTotal(),
            current="<tr id='current'><th>Current</th>",
            desired="<tr id='desired'><th>Desired</th>",
            diff = "<tr id='Diff'><th>Difference</th>",
            prices = "<tr id='Prices'><th>Prices</th>",
            c,d,del,tt,price;
        for(t in tkrs) { 
console.log(t);
            ret += "<th>"+t+"</th>";
            current += "<td>"+(c=await getAlloc(t,allocs.current))+"%</td>";
            desired += "<td>"+(d=await getAlloc(t,allocs.desired))+"%</td>";
            price = t==bot.portfolio.Numeraire ? 1 : await bot.getPrice(t);
            prices += "<td title='balance "+tol+' '+t+"'>"+price+"</td>";
            del = d-c;
            tt = (del > 0 ? 'buy ' : 'sell ')+t+' '+price+' '
                +(sigdig((Math.abs(del/100)*total/price),6,8));
            diff += "<td title='"+tt+"'>"+sigdig(del,5,2)+"</td>";
        };
        ret += "</tr>\n"+current+"</tr>\n"+desired+"</tr>\n"+diff+"</tr>\n"
            + prices + "</tr></table>";
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

    app.listen(port,(e) => { if(e) console.log("HTTP Server failed:",e); });
    return {start,stop};
}
module.exports = Web;
