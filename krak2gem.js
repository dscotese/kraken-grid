/* eslint-disable import/extensions */
import Gem from './gemini.js';

// This translates kraken API calls into Gemini API calls
// so that code written for Kraken will work against Gemini
// --------------------------------
export default function Gclient(key, secret, options) {
    const gem = new Gem(key, secret);
    const assets = {};
    const gemPairs = {};
    const quotes = new Set();
    const {bot} = options;
    let todayUTC;
    let fees;

  // Calculate the fee for a particular trade volume.
  async function feeOn(notionalAmount) {
    const today = new Date().toISOString().split('T')[0];
    if(todayUTC !== today) {
      fees = await gem.api("notionalvolume");
      todayUTC = today;
    }
    return fees.api_maker_fee_bps * notionalAmount / 10000;
  }

  // Return the symbol Gemini uses for the symbol passed "in Kraken"
  function inKraken(sym, invert = false) {
    const k2g = {
      'ZUSD': 'USD',
      'XXBT': 'BTC',
      'XETH': 'ETH',
      'XLTC': 'LTC',
      'XMLN': 'MLN',
      'ZAUD': 'AUD',
      'ZCAD': 'CAD',
      'ZEUR': 'EUR',
      'ZGBP': 'GBP',
      'ZJPY': 'JPY'
    };
    const g2k = {};
    let ret;
    Object.entries(k2g).forEach(([k,v]) => {g2k[v] = k;});
    // If sym.length > 4, it's probably a market.
    if(sym.length > 4) {
      if(k2g[sym.slice(0,4)] && !invert) {
        ret = k2g[sym.slice(0,4)] + (k2g[sym.slice(4)] || sym.slice(4));
        if(ret) ret = ret.toLowerCase();
      }
      if(g2k[sym.slice(0,3).toUpperCase()] && invert) {
        ret =  g2k[sym.slice(0,3).toUpperCase()] 
          + g2k[sym.slice(3).toUpperCase()];
      }
      if(ret) return ret;
    }
    if((invert ? g2k : k2g)[sym])
      return invert ? g2k[sym] : k2g[sym];
    return sym;
  }

  function makeKAP(bd, qasset) {
    const pairNameLC = (bd.base_currency+qasset.altname).toLowerCase();
    return {
        "altname": pairNameLC,
        "wsname": bd.symbol,    // Suspect same as pairNameLC
        "aclass_base": "currency",
        "base": inKraken(bd.base_currency, true),
        "aclass_quote": "currency",
        "quote": inKraken(bd.quote_currency, true),
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
    const ret = {}; let bc; let qc;
    await Promise.all(gSyms.map(async tp => {
      const details = await gem.api("symbols/details",[tp]);
      qc = details.quote_currency;
      bc = details.base_currency;
      if(!assets[qc]) {
        assets[qc] = {
          aclass:"currency",
          altname:inKraken(qc, true),
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
              altname:inKraken(bc, true),
              decimals:dd,
              display_decimals:dd,
              status:details.status==='open'?'enabled':'disabled'
          };
      }
      ret[tp] = makeKAP(details, assets[qc]);
      return details;   // which is a promise, as Promise.all wants.
    }));
    return ret;
  }

  async function fetchAssets() {
      if(!assets)
          await AssetPairs();
      return assets;
  }

  async function balances() {
      const GBalances = await gem.api('balances');
      let qc; const result = {};
      GBalances.forEach((balobj,i,gb) => {
        qc = inKraken(balobj.currency, true);
        if(assets[balobj.currency]) result[qc] = balobj.amount;
      });
      return result;
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
      orders.forEach(async (o) => {
          toid = `${o.id}K2G1GEMINIGEMINI`;
          toid = `${toid.slice(0,6)}-${toid.slice(6,11)}-${toid.slice(11,17)}`;
          if(!o.is_live) throw Error("Orders returned non-open order.");
          const cost = o.avg_execution_price*o.executed_amount;
          const fee = await feeOn(cost);
          objOpen[toid.slice(0,19)] = {
              "refid": "None",
              "userref": o.client_order_id || 0,
              "status": "open",
              "opentm": (ts=o.timestampms/1000),    // 1688666559.8974,
              "starttm": 0,
              "expiretm": 0,
              "descr": {
                  "pair": o.symbol,
                  "type": o.side,
                  "ordertype": "limit",
                  "price": o.avg_execution_price,
                  "price2": "0",
                  "leverage": "none",
                  "order": `${o.side} ${o.original_amount} ${o.symbol
                    } @ limit ${o.avg_execution_price}`,
                  "close": ""
              },
              "vol": o.original_amount,
              "vol_exec": o.executed_amount,
              "cost": String(cost),
              "fee": String(fee),
              "price": o.avg_execution_price,
              "stopprice": "0.00000",
              "limitprice": "0.00000",
              "misc": "",
              "oflags": "fciq",
              "trades": []
          };
      });
      return objOpen;
  }

  /* This simulation of Kraken can only work if we collect all orders.
    We store them in the Extra object provided from bot.getExtra.
    orders/history might be a better match, and it is coded below
    this function.
   */
  async function fetchTrades(params) {
    const {gemTrades} = {gemTrades:{length:0, lastTS:0}, ...bot.getExtra()};
    // "the list of trades will be sorted by timestamp descending - so the
    // first element in the list will have the highest timestamp value."
    // if we don't include a timestamp, we will get the latest trades and
    // may thereby miss some old ones, so we always include it.
    const orders = await gem.api('mytrades', 
      {timestamp: gemTrades.lastTS, limit_trades: 500});  // Array of obj
    // Gemini returns an array, but at some point, the returned
    // array will include orders we already have.  We can rely on
    // Javascript to overwrite them if they are properties of an
    // object, but as array elements, they will be duplicated.
    // Therefore, gemTrades is an object with a length property.
    if(orders.length) {
      orders.forEach(closedOrder => { gemTrades[closedOrder.tid] = closedOrder; });
      gemTrades.lastTS = orders[0].timestamp;
    }
    // Handle ofs and userref
    // tids in reverse chronological order:
    // eslint-disable-next-line no-restricted-globals
    const tidsRCO = Object.keys(gemTrades).filter(k => !isNaN(k))
      .map(k => gemTrades[k].tid)
      .sort((a,b) => (gemTrades[b].timestampms - gemTrades[a].timestampms));
    gemTrades.length = tidsRCO.length;
    bot.save();
  
    const closed = {};
    let urCount = 0;
    let offset = params.ofs || 0;
    tidsRCO.forEach(tid => {
      if( offset < 1 ) {
        const oo = gemTrades[tid];
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
        if(!params.userref) closed[tid] = klo;
        else if(params.userref === oo.client_order_id) {
          closed[tid] = klo;
          urCount += 1;
        }
      }
      offset -= 1;
    });
    return {closed, count: (params.userref ? urCount : gemTrades.length)};
  }
  
  async function fetchClosed(params) {
    const extra = bot.getExtra();
    const gemClosed = {length:0, lastTS:0, ...(extra.gemClosed)};
    let oidsRCO;
  // "the list of trades will be sorted by timestamp descending - so the
    // first element in the list will have the highest timestamp value."
    // if we don't include a timestamp, we will get the latest trades and
    // may thereby miss some old ones, so we always include it.
    let count = 500;
    while(count === 500) {
      // eslint-disable-next-line no-await-in-loop
      let orders = await gem.api('orders/history', 
        { timestamp: gemClosed.lastTS, 
          limit_orders: 500,
          include_trades: true
        });
      orders = orders.filter(pco => pco.trades.length > 0);  // Array of obj
      // Gemini returns an array, but at some point, the returned
      // array will include orders we already have.  We can rely on
      // Javascript to overwrite them if they are properties of an
      // object, but as array elements, they will be duplicated.
      // Therefore, gemTrades is an object.
      count = orders.length;
      if(orders.length) {
        orders.forEach(closedOrder => {
          const fee = {};
          closedOrder.trades.forEach(t => { 
            fee[t.fee_currency] = (fee[t.fee_currency] || 0)
              + Number(t.fee_amount); 
          });
          const fCur = Object.keys(fee)[0];
          if(Object.keys(fee) > 1) throw new Error("Mixed Currency Fee!");
          // eslint-disable-next-line no-param-reassign
          closedOrder.fee = (fee[fCur] || 0).toFixed(2);
          gemClosed[closedOrder.order_id] = closedOrder;
        });
        gemClosed.lastTS = String(Number(orders[0].timestamp) + 1);
      }
      // Handle ofs and userref
      // oids in reverse chronological order:
      // eslint-disable-next-line no-restricted-globals
      oidsRCO = Object.keys(gemClosed).filter(k => !isNaN(k))
        .map(k => gemClosed[k].order_id)
        .sort((a,b) => (gemClosed[b].timestampms - gemClosed[a].timestampms));
      gemClosed.length = oidsRCO.length;
      const oldSize = extra.gemClosed.length;
      extra.gemClosed = gemClosed;
      if(oldSize !== gemClosed.length) bot.save();
    }
    let toid;
    const closed = {};
    let urCount = 0;
    const offset = params.ofs || 0;
    for(let i = offset; i < offset + 50; i += 1) {
      const oid = oidsRCO[i];
      if(!oid) break;
      const oo = gemClosed[oid];
      toid = `${oo.id.slice(-10)}K2G1GEMINIGEMINI`;
      toid = `${toid.slice(0,6)}-${toid.slice(6,11)}-${toid.slice(11,17)}`;
      const cost = oo.executed_amount * oo.price;
      // const fee = await feeOn(cost);
      const klo = {       // Kraken-Like-Order
        refid: null,
        userref: 0,
        cl_ord_id: oo.client_order_id,
        status: oo.break ? `broke:${oo.break}` : "closed",
        opentm: Number(oo.timestamp),
        starttm: 0,
        expiretm: 0,
        descr: { pair: oo.symbol,
          type: oo.side,
          order_type: /limit$/.test(oo.type) ? "limit" : "market",
          price: oo.price,
          price2: 0,
          leverage: "none",
          order: `${oo.side} ${oo.original_amount} ${oo.symbol
            } @ ${/^market/.test(oo.type) ? "" : "limit"} ${oo.price}`,
          close: ""
        },
        vol: oo.original_amount,
        vol_exec: oo.executed_amount,
        cost: String(cost),
        fee: String(oo.fee),
        price: oo.price,
        stopprice: "0.00000",
        limitprice: "0.00000",
        closetm: oo.timestampms/1000,
      };    
      if(!params.userref) closed[toid] = klo;
      else if(params.userref === oo.client_order_id) {
        closed[toid] = klo;
        urCount += 1;
      }
    }
    return {closed, count: (params.userref ? urCount : gemClosed.length)};
  }
  
  async function readTicker(market, receiver) {
    if( !gemPairs[market] ) {
      console.log(`Convert ${market} to Gemini's symbol first.`);
      return;
    }
    const ticker = await gem.api('v2/ticker', {symbol: market});
    if(ticker) {
      // eslint-disable-next-line no-param-reassign
      receiver[market] = {
        a: [ticker.ask,0,0],
        b: [ticker.bid,0,0],
        c: [ticker.close,0],
        v: '',
        p: '',
        t: 0,
        l: ticker.low,
        h: ticker.high,
        o: ticker.open
      };
    }
  }

  async function addOrder(params) {
    const {pair, userref, type, price, volume, close} = params;
    const ret = await gem.api('order/new', {
      client_order_id: String(userref),
      symbol: pair,
      amount: String(volume),
      price: String(price),
      side: type,
      type: "exchange limit"
    });
    // If there is a close, register it with the WebServices handler.
    // ... TODO
    if(close) console.log("Conditional Close not yet supported.");
    return ret;
  }
        
  async function api(method, params) {
    const cached = {}; // k2gtfc.isCached('k2gapi',[method,params]);
    let ret = {};
    const errors = [];
    if(process.USECACHE && cached.answer) return cached.cached;
    
    try {
        if(method === 'AssetPairs') {
            if(Object.keys(gemPairs).length > 0 
              && !params.refresh) return gemPairs();
            // eslint-disable-next-line no-param-reassign
            if(params) delete params.refresh;
            ret = await AssetPairs();
            Object.assign(gemPairs, ret);
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
            ret = {open: ret};
        } else if(method === 'ClosedOrders') {
            if( params.closetime && params.closetime !== 'close' )
              throw new Error("Gemini provides only execution time.");
            ret = await fetchClosed(params);
        } else if(method === 'Ticker') {
          if( /,/.test(params.pair) ) {
              await Promise.all( params.pair.split(',')
                .map(async p => (readTicker(p, ret)) ));
          } else await readTicker( params.pair, ret );
        } else if(method === 'AddOrder') {
          ret = addOrder(params);
        } else if(method === 'order/events') {
          ret = await(gem.api(method));
        } else console.log(method, params, "???");
    } catch(e) {
        errors.push(e.message);
        ret = {};
    }
    
    ret = {error:errors, result:ret};
    // if(!cached || !cached.answer) k2gtfc.store(cached.id,ret);
    return ret;
  }

  return {api, inKraken, assets, quotes};
}