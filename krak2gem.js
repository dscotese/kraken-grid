/* eslint-disable import/extensions */
import Gem from './gemini.js';
import TFC from './testFasterCache.js';

//const k2gtfc = TFC(process.TESTING,process.argv[2]);
// This translates kraken API calls into Gemini API calls
// so that code written for Kraken will work against Gemini
// --------------------------------
export default function Gclient(key, secret, options) {
    const gem = new Gem(key, secret);
    const assets = {};
    const quotes = new Set();

  function makeKAP(bd, qasset) {
    const pairNameLC = (bd.quote_currency+qasset.altname).toLowerCase();
    return {
        "altname": pairNameLC,
        "wsname": bd.symbol,    // Suspect same as pairNameLC
        "aclass_base": "currency",
        "base": bd.base_currency,
        "aclass_quote": "currency",
        "quote": bd.quote_currency,
        "lot": "unit",
        "cost_decimals": bd.quote_increment,
        "pair_decimals": bd.tick_size,
        "lot_decimals": 8,
        "lot_multiplier": 1,
        "leverage_buy": [],
        "leverage_sell": [],
        "fees": [
          [
            0,
            0.4
          ],
          [
            10000,
            0.30
          ],
          [
            50000,
            0.25
          ],
          [
            100000,
            0.20
          ],
          [
            1000000,
            0.15
          ],
          [
            5000000,
            0.10
          ],
          [
            10000000,
            0.08
          ],
          [
            50000000,
            0.05
          ],
          [
            100000000,
            0.04
          ],
          [
            500000000,
            0.03
          ]
        ],
        "fees_maker": [
          [
            0,
            0.20
          ],
          [
            10000,
            0.10
          ],
          [
            50000,
            0.10
          ],
          [
            100000,
            0.08
          ],
          [
            1000000,
            0.05
          ],
          [
            5000000,
            0.03
          ],
          [
            10000000,
            0.02
          ],
          [
            50000000,
            0.00
          ],
          [
            5000000,
            0.00
          ],
          [
            10000000,
            0.00
          ]
        ],
        "fee_volume_currency": "USD",
        "margin_call": 80,
        "margin_stop": 40,
        "ordermin": String(bd.min_order_size),
        "costmin": "0",
        "tick_size": bd.tick_size,
        "status": bd.status === 'open'
            ? 'online'
            : bd.status
    }
  }

  async function AssetPairs() {
/* Call symbols to get list of pairs:
["btcusd", "ethbtc", "ethusd", "bchusd", "bchbtc", "bcheth", "ltcusd", "ltcbtc", "ltceth", "ltcbch", "batusd", "daiusd", "linkusd", "oxtusd", "linkbtc", "linketh", "ampusd", "compusd", "paxgusd", "mkrusd", "zrxusd", "manausd", "storjusd", "snxusd", "crvusd", "uniusd", "renusd", "umausd", "yfiusd", "btcdai", "ethdai", "aaveusd", "filusd", "btceur", "btcgbp", "etheur", "ethgbp", "btcsgd", "ethsgd", "sklusd", "grtusd", "lrcusd", "sandusd", "cubeusd", "lptusd", "maticusd", "injusd", "sushiusd", "dogeusd", "ftmusd", "ankrusd", "btcgusd", "ethgusd", "ctxusd", "xtzusd", "axsusd", "lunausd", "efilfil", "gusdusd", "dogebtc", "dogeeth", "rareusd", "qntusd", "maskusd", "fetusd", "api3usd", "usdcusd", "shibusd", "rndrusd", "galausd", "ensusd", "elonusd", "tokeusd", "ldousd", "rlyusd", "solusd", "apeusd", "gusdsgd", "qrdousd", "zbcusd", "chzusd", "jamusd", "gmtusd", "aliusd", "gusdgbp", "dotusd", "ernusd", "galusd", "samousd", "imxusd", "iotxusd", "avaxusd", "atomusd", "usdtusd", "btcusdt","ethusdt","pepeusd","xrpusd", "hntusd", "btcgusdperp", "ethgusdperp", "pepegusdperp","xrpgusdperp", "solgusdperp", "maticgusdperp", "dogegusdperp", "linkgusdperp", "avaxgusdperp", "ltcgusdperp", "dotgusdperp", "bnbgusdperp", "injgusdperp", "wifgusdperp"]
*/
    const gSyms = await gem.api("symbols");
    console.log(gSyms);
    // Call for details on each one to simulate Kraken's answer
    const ret = {error: [], result: {}}; let bc; let qc;
    await Promise.all(gSyms.map(async tp => {
      const details = await gem.api("symbols/details",[tp]);
      qc = details.quote_currency;
      bc = details.base_currency;
      if(!assets[qc]) {
        assets[qc] = {
          aclass:"currency",
          altname:qc,
          decimals:2,
          display_decimals:5,
          status:"enabled"
        };
        quotes.add(qc);   // Keep track of our numeraires.
      }
      // assets[tp] = {};
      if(!assets[bc]) {
          const dd = -Math.log10(details.tick_size);
          assets[bc] = {
              aclass:"currency",
              altname:bc,
              decimals:dd,
              display_decimals:dd,
              status:details.status==='open'?'enabled':'disabled'
          };
      }
      ret.result[tp] = makeKAP(details, assets[qc]);
    }));
    console.log(ret);
    return ret;
  }

  async function fetchAssets() {
      if(!assets)
          await AssetPairs();
      return {error:[], result:assets};
  }

  async function balances() {
      const GBalances = await gem.api('balances');
      let qc; const result = {};
      GBalances.forEach((balobj) => {
        qc = balobj.currency.toLowerCase();
        if(quotes.has(qc)) result[qc] = balobj.amount;
      });
      return { error:[], result }
  }

/* From Kraken's Docs:
{
  "error": [],
  "result": {
    "open": {
      "OQCLML-BW3P3-BUCMWZ": {
        "refid": "None",
        "userref": 0,
        "status": "open",
        "opentm": 1688666559.8974,
        "starttm": 0,
        "expiretm": 0,
        "descr": {
          "pair": "XBTUSD",
          "type": "buy",
          "ordertype": "limit",
          "price": "30010.0",
          "price2": "0",
          "leverage": "none",
          "order": "buy 1.25000000 XBTUSD @ limit 30010.0",
          "close": ""
        },
        "vol": "1.25000000",
        "vol_exec": "0.37500000",
        "cost": "11253.7",
        "fee": "0.00000",
        "price": "30010.0",
        "stopprice": "0.00000",
        "limitprice": "0.00000",
        "misc": "",
        "oflags": "fciq",
        "trades": [
          "TCCCTY-WE2O6-P3NB37"
        ]
      }, etc.
*/
  async function fetchOrders() {
      const orders = await gem.api('orders');  // Array of obj
      const objOpen = {}; let toid; let ts;
      orders.forEach((o) => {
          toid = `${o[0]}K2G1GEMINIGEMINI`;
          toid = `${toid.substr(0,6)}-${toid.substr(6,5)}-${toid.substr(11)}`;
          if(!o.is_live) throw Error("Orders returned non-open order.");
          objOpen[toid.substr(0,19)] = {
              "refid": "None",
              "userref": o.client_order_id || 0,
              "status": "open",
              "opentm": (ts=o.timestampms/1000),    // 1688666559.8974,
              "starttm": ts,
              "expiretm": 0,
              "descr": {
                  "pair": o.symbol,
                  "type": o.side,
                  "ordertype": "limit",
                  "price": "30010.0",
                  "price2": "0",
                  "leverage": "none",
                  "order": "buy 1.25000000 XBTUSD @ limit 30010.0",
                  "close": ""
              },
              "vol": "1.25000000",
              "vol_exec": "0.37500000",
              "cost": "11253.7",
              "fee": "0.00000",
              "price": "30010.0",
              "stopprice": "0.00000",
              "limitprice": "0.00000",
              "misc": "",
              "oflags": "fciq",
              "trades": []
          };
      });          
  }

  async function fetchTrades() {
    const orders = await gem.api('mytrades');  // Array of obj
    const closed = {};
    orders.forEach(oo => {
      const klo = {       // Kraken-Like-Order
        descr: { pair: oo.symbol,
            type: oo.type.toLowerCase(),
            order_type: oo.aggressor ? "market" : "limit",
            price: oo.price,
            order: `${oo.type} ${oo.amount} ${oo.symbol} @ `
              + `${oo.aggressor ? "" : "limit"} ${oo.price}`,
            price2: 0,
            leverage: "none",
            close: ""
        },
        cl_ord_id: oo.client_order_id,
        status: oo.break ? `broke:${oo.break}` : "closed",
        opentm: 0,
        starttm: 0,
        expiretm: 0,
        vol: oo.amount,
        vol_exec: oo.amount,
        cost: oo.fee_amount,
        price: oo.price,
        stopprice: "0.00000",
        limitprice: "0.00000",
        closetm: oo.timestampms,
        refid: oo.order_id
      };    
      closed[oo.tid] = klo;
    });
    return closed;
  }
        
  async function api(method, params, options) {
    const cached = {}; //k2gtfc.isCached('k2gapi',[method,params,options]);
    let ret = {};
    const errors = [];
    if(process.USECACHE && cached.answer) return cached.cached;
    
    try {
        if(method === 'AssetPairs') {
            ret = await AssetPairs();
        } else if(method === 'Assets') {
            ret = await fetchAssets();
        } else if(method === 'Balance') {
            ret = await balances();
        } else if(method === 'TradeBalance') {
            ret = {c: 0, v: 0, n: 0};
        } else if(method === 'OpenPositions') 
            ret = {};
        else if(method === 'OpenOrders') {
            ret = await fetchOrders();
        } else if(method === 'ClosedOrders') {
            ret = await fetchTrades();
        } else console.log(method, params, "???");
    } catch(e) {
        errors.push(e.message);
        ret = {};
    }
    
    ret = {error:errors, result:ret};
    // if(!cached || !cached.answer) k2gtfc.store(cached.id,ret);
    return ret;
  }

  return {api, assets, quotes};
}