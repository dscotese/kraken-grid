/* eslint-disable no-restricted-globals */
import express from 'express';
import basicAuth from "express-basic-auth";
import path from "path";
import session from 'express-session';
import bodyParser from 'body-parser';
import fs from 'fs';
import type { Portfolio } from './types.d.ts';
import { BotInstance } from './bot.js';

const app = express();

interface Config {
  web?: any;
  bot: BotInstance;
  man: any;
  stored: any;
  [key: string]: any;
}

interface WebConfig {
  start: (port?: number) => void;
  stop: () => void;
  address: () => false | string;
}

function Web(config: Config): WebConfig {
  if(config.web) return config.web;
  
  let server: any = false;
  const logOriginal = console.log;
  const {bot, man} = config;
  const portfolio: Portfolio = bot.getPortfolio();
  const {sigdig} = portfolio.Allocation;
  const tkrs: Record<string, number> = {}; // Associative array of totals for ticker indices.
  let logged = "<!-- init at 10 -->";

  function log(...a: any[]): void {
    logged += `\n${a.join(' ')}`;
    if(logged.length > 1000) {
      logOriginal("Web!",logged);
      logged = '';
    }
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

  app.use("/js",express.static(path.join('.', 'static')));
  app.use("/img",express.static(path.join('.', 'static')));
  app.use(basicAuth({
    challenge: true,
    users: { 'admin': config.stored.getPW() }
  }));

  function stop(): void { 
    if(server) server.close();
    server = false;
    if(logOriginal) console.log = logOriginal;
    console.log("WebServer is off."); 
  }

  function start(pport: number = port): void { 
    if(server) server.close();
    server = app.listen(pport,(e) => { if(e) console.log("HTTP Server failed:",e); });
    // Trap the console.log function
    console.log = log;
    logOriginal(`Server is running on http://${host}:${pport}`); 
  }

  function address(): false | string { 
    return server ? server.address : false; 
  }

  app.use(bodyParser.urlencoded({ extended: false }));

  function getJQ(): string { 
    return "<script type='text/javascript'" +
      "src='http://code.jquery.com/jquery-latest.min.js'></script>\n";
  }

  function head(whatElse: string = ''): string {
    return `<!DOCTYPE html><head>${getJQ()
    }<script type='module' src='/js/md-block.js'></script>\n`
    + `<script type='text/javascript' src='/js/gallocation.js' defer></script>\n`
    + `<script type='text/javascript' src='/js/imgByKtick.js'></script>\n`
    + `<script type='text/javascript' src='/js/client.js' defer></script>\n`
    + `<link rel='stylesheet' href='/js/main.css'>\n${
    whatElse}</head>\n`; 
  }

  function Documentation(): string {
    const rf = fs.readFileSync("./README.md",{encoding:'utf8'}); // ,
    return `<div id='Doc'><md-block>${rf}</md-block></div>`;
  }

  app.get('/', async (req, res, next) => {
    logged = ""; // "<!-- " + {req,res,next} + " -->";
    res.write(`${head() + Documentation() 
         }<div id='GDiv'><canvas id='myCanvas'>`
        + `Your browser doesn't support the HTML5 canvas.</canvas>`
        + `</div><div id='LDiv'></div><div id='RDiv'></div>`);
    res.end();

    logged = "<!-- Reset at 63 -->";
    next();
  });

  function weblink(tkr: string): string {
    if(tkr === portfolio.Numeraire) return portfolio.Numeraire;
    return `<a href='https://trade.kraken.com/charts/KRAKEN:${ 
      tkr[0] === 'X' && tkr.length === 4
        ? tkr.substr(1) : tkr 
      }-${portfolio.Numeraire.substr(1)
      }' target='chart'>${tkr}</a>`;
  }

  function AssetsTable(): string {
    const Savs = portfolio.Savings; 
    const total = portfolio.Allocation.getTotal();
    let tbody = "";
    let ktks = tkrs ? Object.keys(tkrs) : [];
    let ret = ""; 
    const rows: Record<string, Array<{key: string, val: string}>> = {}; // rows is an associative array of object arrays.
    let tkr; 
    let amt; 
    let ki; 
    let label; 
    let sav; // ktks is "Known Tickers"
    
    rows[''] = [{key:'AAAA',val:`<th title='Total Value'>${
      sigdig(total,10,2)}</th>`}].concat(ktks.map((e) => ({ key:e, val:`<th>${weblink(e)}</th>` })));
    
    // Add exchange assets to list of "Savings Accounts"
    ktks.forEach(t => { tkrs[t] = 0; });
    
    for(let h = 0; h <= Savs.length; h += 1) {
      ki = 0;
      sav = h === Savs.length
        ? bot.ExchangeSavings()
        : Savs[h];
      label = sav.label;
      const assets = sav.assets.sort((a: any, b: any) => a.ticker < b.ticker ? -1 : 1);
      rows[label] = [{key:'AAAA',val:`<th>${label}</th>`}];
      
      for(let a = 0; a < assets.length; a += 1) {
        [tkr, amt] = [assets[a].ticker, assets[a].amount];
        rows[label].push({key:tkr,
          val:`<td tkr='${tkr}' acct='${label}' amt='${amt}'>${amt}</td>`});
        if(isNaN(tkrs[tkr])) {
          tkrs[tkr] = amt;          // Initialized.
          rows[''].push({key:tkr, val:`<th>${weblink(tkr)}</th>`});
          ktks.push(tkr);
          ki += 1;
        } else tkrs[tkr] += amt;    // Totals for ticker indices.
      }
    }
    
    rows.ZTotal = [{key:'AAAA',val:"<th>Totals</th>"}];
    ktks = ktks.sort();
    ktks.forEach(t => { rows.ZTotal.push({key:t,val:`<th>${sigdig(tkrs[t],8,2)}</th>`})});
    
    Object.keys(rows).forEach(r => { 
      rows[r].sort((a,b) => a.key < b.key ? -1 : 1);
      let asString = ""; 
      let rs;
      ki = 0;
      Object.keys(rows[r]).forEach(s => { 
        rs = rows[r][s];
        if(rs.key !== 'AAAA') {
          while(ki < ktks.length && ktks[ki] !== rs.key) {
            ki += 1;
            asString += "<td></td>";
          }
        }
        asString += rs.val;
      });
      // <td>s needed at the end
      const tail = ktks.length - ktks.findIndex(e => e === rows[r].at(-1)?.key);
      asString += "<td></td>".repeat(tail-1);
      tbody += `<tr>${asString}</tr>\n`;
    });
    
    ret = `<div><table id='assets'>${tbody}</table></div>`;
    return ret;
  }

  app.get('/data', async (req, res) => {
    logged = "Reset at 73";
    // Report called recently enough if on auto
    // ----------------------------------------
    if(man.getAuto() === -1) await bot.report(false);
    // I planned to remove AssetsTable, but it creates the tkrs array.
    // ---------------------------------------------------------------
    AssetsTable(); // Called for side-effect of collecting tkrs from savings.
    const [current, desired, adjust, ranges] = await portfolio.Allocation.Allocations(tkrs);
    const tt: Record<string, any> = {};
    
    Array.from(portfolio.Tickers)
      .forEach((t: any) => {
        tt[t] = portfolio[t];
      });
      
    // Include tickers not on the exchange:
    // ------------------------------------
    await Promise.all(
      Object.keys(tkrs).filter((k) => !Object.keys(tt).includes(k))
      .map(async (t) => {
        const p = await bot.getPrice(t);
        tt[t] = [tkrs[t], p];
      })
    );
    
    const refreshPeriod = man.getAuto();
    const orderedClosed = portfolio.Closed?.orders
      ? Object.entries(portfolio.Closed?.orders)
        .sort((a, b) => a[1].closetm - b[1].closetm).slice(-5) 
      : "No closed orders yet.";
      
    res.send(JSON.stringify({
      orders:  portfolio.O || [],
      grid:    portfolio.G,
      savings: portfolio.Savings,
      exsaves: bot.ExchangeSavings(),
      numer:   portfolio.Numeraire,
      tickers: tt,
      total:   portfolio.Allocation.getTotal(),
      current,
      desired,
      adjust,
      ranges,
      FLAGS: bot.FLAGS,
      refresh_period: refreshPeriod,
      closed: orderedClosed
    }));
    // console.log("Sent Closed:", Object.entries(portfolio.Closed.orders).slice(-5));
  });

  app.post('/', async (req, res, next) => {
    const cmd = [req.body.data];
    console.log = log; 
    logged = "<!-- Reset at 119 -->";
    await man.doCommands(cmd);
    // console.log("Received "+cmd);
    res.send(logged);
    console.log = logOriginal;
    next();
  });

  // eslint-disable-next-line no-param-reassign
  config.web = {start, stop, address};
  return config.web;
}

export default Web;