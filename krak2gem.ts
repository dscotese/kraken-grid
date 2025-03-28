/* eslint-disable import/extensions */
import Gem from './gemini.js';

// Define interfaces
interface GemClientOptions {
  bot: any;
  [key: string]: any;
}

interface AssetInfo {
  aclass: string;
  altname: string;
  decimals: number;
  display_decimals: number;
  status: string;
  [key: string]: any;
}

interface SymbolDetails {
  symbol: string;
  base_currency: string;
  quote_currency: string;
  tick_size: number;
  quote_increment: number;
  min_order_size: number;
  status: string;
  [key: string]: any;
}

interface GemOrder {
  id: string;
  client_order_id: number | null;
  is_live: boolean;
  avg_execution_price: number;
  executed_amount: number;
  original_amount: number;
  side: string;
  price: string | number;
  symbol: string;
  timestampms: number;
  timestamp: string;
  type: string;
  trades: any[];
  [key: string]: any;
}

interface GemTrade {
  tid: number;
  type: string;
  aggressor: boolean;
  amount: string;
  price: string;
  fee_amount: string;
  fee_currency: string;
  order_id: string;
  client_order_id: number | null;
  symbol: string;
  timestampms: number;
  timestamp: string;
  break?: string;
  [key: string]: any;
}

interface KrakenLikeOrder {
  refid: string | null;
  userref: number;
  cl_ord_id?: number | null;
  status: string;
  opentm: number;
  starttm: number;
  expiretm: number;
  descr: {
    pair: string;
    type: string;
    order_type?: string;
    ordertype?: string;
    price: string | number;
    price2: string | number;
    leverage: string;
    order: string;
    close: string;
  };
  vol: string | number;
  vol_exec: string | number;
  cost: string;
  fee: string;
  price: string | number;
  stopprice: string;
  limitprice: string;
  misc?: string;
  oflags?: string;
  closetm?: number;
  trades?: string[];
  [key: string]: any;
}

interface ClosedOrdersResponse {
  closed: Record<string, KrakenLikeOrder>;
  count: number;
}

interface GemTradesCache {
  gemTrades?: Record<string, GemTrade>;
  length: number;
  lastTS: number | string;
  [key: string]: any;
}

// This translates kraken API calls into Gemini API calls
// so that code written for Kraken will work against Gemini
// --------------------------------
export default class Gclient {
  private gem: any;
  private assets: Record<string, AssetInfo>;
  private gemPairs: Record<string, any>;
  private quotes: Set<string>;
  private bot: any;
  private todayUTC?: string;
  private fees?: any;
  private gemTrades?: GemTradesCache;

  constructor(key: string, secret: string, options: GemClientOptions) {
    this.gem = Gem(key, secret);
    this.assets = {};
    this.gemPairs = {};
    this.quotes = new Set();
    this.bot = options.bot;
    // bot.pairs needs to know what all is on the exchange
  }

  // Calculate the fee for a particular trade volume.
  async feeOn(notionalAmount: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    if (this.todayUTC !== today) {
      this.fees = await this.gem.api("notionalvolume");
      this.todayUTC = today;
    }
    return this.fees.api_maker_fee_bps * notionalAmount / 10000;
  }

  // Return the symbol Gemini uses for the symbol passed "in Kraken"
  static inKraken(sym: string, invert = false): string {
    const k2g: Record<string, string> = {
      'ZUSD': 'USD',
      'XXBT': 'BTC',
      'XETH': 'ETH',
      'XLTC': 'LTC',
      'XMLN': 'MLN',
      'XZEC': 'ZEC',
      'ZAUD': 'AUD',
      'ZCAD': 'CAD',
      'ZEUR': 'EUR',
      'ZGBP': 'GBP',
      'ZJPY': 'JPY'
    };
    const g2k: Record<string, string> = {};
    let ret: string | undefined;
    Object.entries(k2g).forEach(([k, v]) => { g2k[v] = k; });
    // If sym.length > 4, it's probably a market.
    if (sym.length > 4) {
      if (k2g[sym.slice(0, 4)] && !invert) {
        ret = k2g[sym.slice(0, 4)] + (k2g[sym.slice(4)] || sym.slice(4));
        if (ret)
          ret = ret.toLowerCase();
      }
      if (g2k[sym.slice(0, 3).toUpperCase()] && invert) {
        ret = g2k[sym.slice(0, 3).toUpperCase()]
          + g2k[sym.slice(3).toUpperCase()];
      }
      if (k2g[sym.slice(-4)] && !invert) {
        const quote = k2g[sym.slice(-4)] || sym.slice(-4);
        const base = k2g[sym.slice(0, -4)] || sym.slice(0, -4);
        ret = (base + quote).toLowerCase();
      }
      if (ret)
        return ret;
    }
    if ((invert ? g2k : k2g)[sym])
      return invert ? g2k[sym] : k2g[sym];
    return sym;
  }

  makeKAP(bd: SymbolDetails, qasset: AssetInfo): any {
    const pairNameLC = (bd.base_currency + qasset.altname).toLowerCase();
    const kBase = Gclient.inKraken(bd.base_currency, true);
    const kQuote = Gclient.inKraken(bd.quote_currency, true);
    return {
      "altname": kBase + kQuote,
      "wsname": bd.symbol, // Suspect same as pairNameLC
      "aclass_base": "currency",
      "base": kBase,
      "aclass_quote": "currency",
      "quote": kQuote,
      "lot": "unit",
      "cost_decimals": bd.quote_increment,
      "pair_decimals": bd.tick_size,
      "lot_decimals": 8,
      "lot_multiplier": 1,
      "leverage_buy": [],
      "leverage_sell": [],
      "fees": [
        [0, 0.4],
        [10000, 0.30],
        [50000, 0.25],
        [100000, 0.20],
        [1000000, 0.15],
        [5000000, 0.10],
        [10000000, 0.08],
        [50000000, 0.05],
        [100000000, 0.04],
        [500000000, 0.03]
      ],
      "fees_maker": [
        [0, 0.20],
        [10000, 0.10],
        [50000, 0.10],
        [100000, 0.08],
        [1000000, 0.05],
        [5000000, 0.03],
        [10000000, 0.02],
        [50000000, 0.00],
        [5000000, 0.00],
        [10000000, 0.00]
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
    };
  }

  async balances(): Promise<Record<string, string>> {
    const GBalances = await this.gem.cachedApi('balances');
    const result: Record<string, string> = {};
    GBalances.forEach((balobj: any) => {
      result[Gclient.inKraken(balobj.currency, true)] = balobj.amount;
    });
    return result;
  }

  async AssetPairs(): Promise<Record<string, any>> {
    /* Call symbols to get the array of pairs */
    const gSyms = await this.gem.api("symbols");
    console.log(gSyms);
    // Call for details on those in our portfolio.
    const ret: Record<string, any> = {};
    const portfolio = this.bot.getPortfolio();
    const gBals = await this.balances(); // returns Kraken symbols.
    const bKeys = Object.keys(gBals); // .map(x => x.currency);
    const kNum = portfolio.Numeraire;
    const gNum = Gclient.inKraken(kNum);
    bKeys.forEach(x => {
      if (kNum !== x)
        portfolio.Pairs.add(x + kNum);
    });
    const gPairs = bKeys.map(x => (Gclient.inKraken(x) + gNum).toLowerCase())
      .filter(x => x !== (gNum + gNum).toLowerCase());
    //    const pSyms = gSyms.map(sym => (this.inKraken(sym,true))));
    await Promise.all(gPairs.map(async (tp) => {
      let bc: string;
      let qc: string;
      try {
        const details = await this.gem.api("symbols/details", [tp]);
        qc = Gclient.inKraken(details.quote_currency, true);
        bc = Gclient.inKraken(details.base_currency, true);
        if (!this.assets[qc]) {
          this.assets[qc] = {
            aclass: "currency",
            altname: details.quote_currency,
            decimals: 2,
            display_decimals: 5,
            status: "enabled"
          };
          this.quotes.add(qc); // Keep track of our numeraires.
        }
        // this.assets[tp] = {};
        if (!this.assets[bc]) {
          const dd = -Math.log10(details.tick_size);
          this.assets[bc] = {
            aclass: "currency",
            altname: details.base_currency,
            decimals: dd,
            display_decimals: dd,
            status: details.status === 'open' ? 'enabled' : 'disabled'
          };
        }
        ret[tp] = this.makeKAP(details, this.assets[qc]);
        return details; // which is a promise, as Promise.all wants.
      }
      catch (e) {
        console.log(`Failed to get details for: ${tp}.`);
      }
    }));
    return ret;
  }

  async fetchAssets(): Promise<Record<string, AssetInfo>> {
    if (!this.assets || Object.keys(this.assets).length === 0)
      await this.AssetPairs();
    return this.assets;
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
  async fetchOrders(): Promise<Record<string, KrakenLikeOrder>> {
    const orders = await this.gem.api('orders') as GemOrder[]; // Array of obj
    const objOpen: Record<string, KrakenLikeOrder> = {};
    
    await Promise.all(orders.map(async (o) => {
      let toid = `${BigInt(o.id).toString(36).toUpperCase()}K2G1GEMINIGEMINI`;
      toid = `${toid.slice(0, 6)}-${toid.slice(6, 11)}-${toid.slice(11, 17)}`;
      if (!o.is_live)
        throw Error("Orders returned non-open order.");
      const cost = o.avg_execution_price * o.executed_amount;
      const fee = await this.feeOn(cost);
      objOpen[toid.slice(0, 19)] = {
        "refid": "None",
        "userref": o.client_order_id || 0,
        "status": "open",
        "opentm": o.timestampms / 1000, // 1688666559.8974,
        "starttm": 0,
        "expiretm": 0,
        "descr": {
          "pair": o.symbol,
          "type": o.side,
          "ordertype": "limit",
          "price": o.price,
          "price2": "0",
          "leverage": "none",
          "order": `${o.side} ${o.original_amount} ${o.symbol} @ limit ${o.price}`,
          "close": ""
        },
        "vol": o.original_amount,
        "vol_exec": o.executed_amount,
        "cost": String(cost),
        "fee": String(fee),
        "price": o.price,
        "stopprice": "0.00000",
        "limitprice": "0.00000",
        "misc": "",
        "oflags": "fciq",
        "trades": []
      };
    }));
    
    return objOpen;
  }

  /* This simulation of Kraken can only work if we collect all orders.
    We store them in the Extra object provided from this.bot.getExtra.
    orders/history might be a better match, and it is coded below
    this function.
   */
  async fetchTrades(params: { ofs?: number; userref?: number }): Promise<ClosedOrdersResponse> {
    this.gemTrades = { gemTrades: { length: 0, lastTS: 0 }, ...this.bot.getExtra() } as GemTradesCache;
    // "the list of trades will be sorted by timestamp descending - so the
    // first element in the list will have the highest timestamp value."
    // if we don't include a timestamp, we will get the latest trades and
    // may thereby miss some old ones, so we always include it.
    const orders = await this.gem.api('mytrades', 
      { timestamp: this.gemTrades.lastTS, limit_trades: 500 }); // Array of obj
      
    // Gemini returns an array, but at some point, the returned
    // array will include orders we already have.  We can rely on
    // Javascript to overwrite them if they are properties of an
    // object, but as array elements, they will be duplicated.
    // Therefore, this.gemTrades is an object with a length property.
    if (orders.length) {
      orders.forEach((closedOrder: GemTrade) => { 
        this.gemTrades![closedOrder.tid] = closedOrder; 
      });
      this.gemTrades.lastTS = orders[0].timestamp;
    }
    
    // Handle ofs and userref
    // tids in reverse chronological order:
    // eslint-disable-next-line no-restricted-globals
    const tidsRCO = Object.keys(this.gemTrades)
      .filter(k => !isNaN(Number(k)))
      .map(k => this.gemTrades![k].tid)
      .sort((a, b) => (this.gemTrades![b].timestampms - this.gemTrades![a].timestampms));
      
    this.gemTrades.length = tidsRCO.length;
    this.bot.save();
    
    const closed: Record<string, KrakenLikeOrder> = {};
    let urCount = 0;
    let offset = params.ofs || 0;
    
    tidsRCO.forEach(tid => {
      if (offset < 1) {
        const oo = this.gemTrades![tid];
        const klo: KrakenLikeOrder = {
          descr: { 
            pair: oo.symbol,
            type: oo.type.toLowerCase(),
            order_type: oo.aggressor ? "market" : "limit",
            price: oo.price,
            order: `${oo.type} ${oo.amount} ${oo.symbol} @ ` +
              `${oo.aggressor ? "" : "limit"} ${oo.price}`,
            price2: 0,
            leverage: "none",
            close: ""
          },
          cl_ord_id: oo.client_order_id,
          userref: oo.client_order_id.replace(/u.*$/,''),
          fee: oo.fee_amount,
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
        
        if (!params.userref)
          closed[tid] = klo;
        else if (params.userref === oo.client_order_id) {
          closed[tid] = klo;
          urCount += 1;
        }
      }
      offset -= 1;
    });
    
    return { closed, count: (params.userref ? urCount : this.gemTrades.length) };
  }

  async fetchClosed(params: { ofs?: number; userref?: number; closetime?: string }): Promise<ClosedOrdersResponse> {
    const extra = this.bot.getExtra();
    const gemClosed: any = { length: 0, lastTS: 0, ...(extra.gemClosed) };
    let oidsRCO: string[] = [];
    
    // "the list of trades will be sorted by timestamp descending - so the
    // first element in the list will have the highest timestamp value."
    // if we don't include a timestamp, we will get the latest trades and
    // may thereby miss some old ones, so we always include it.
    let count = 500;
    while (count === 500) {
      // eslint-disable-next-line no-await-in-loop
      let orders = await this.gem.api('orders/history', { 
        timestamp: gemClosed.lastTS,
        limit_orders: 500,
        include_trades: true
      });
      
      if (orders.length > 0)
        orders = orders.filter(pco => pco.trades.length > 0); // Array of obj
        
      // Gemini returns an array, but at some point, the returned
      // array will include orders we already have.  We can rely on
      // Javascript to overwrite them if they are properties of an
      // object, but as array elements, they will be duplicated.
      // Therefore, this.gemTrades is an object.
      count = orders.length;
      
      if (orders.length) {
        orders.forEach(closedOrder => {
          const fee: Record<string, number> = {};
          closedOrder.trades.forEach((t: any) => {
            fee[t.fee_currency] = (fee[t.fee_currency] || 0) + Number(t.fee_amount);
          });
          
          const fCur = Object.keys(fee)[0];
          if (Object.keys(fee).length > 1)
            throw new Error("Mixed Currency Fee!");
            
          // eslint-disable-next-line no-param-reassign
          closedOrder.fee = (fee[fCur] || 0).toFixed(2);
          gemClosed[closedOrder.order_id] = closedOrder;
        });
        
        gemClosed.lastTS = String(Number(orders[0].timestamp) + 1);
      }
      
      // Handle ofs and userref
      // oids in reverse chronological order:
      // eslint-disable-next-line no-restricted-globals
      oidsRCO = Object.keys(gemClosed)
        .filter(k => !isNaN(Number(k)))
        .map(k => gemClosed[k].order_id)
        .sort((a, b) => (gemClosed[b].timestampms - gemClosed[a].timestampms));
        
      gemClosed.length = oidsRCO.length;
      const oldSize = extra.gemClosed?.length || 0;
      extra.gemClosed = gemClosed;
      
      if (oldSize !== gemClosed.length)
        this.bot.save();
    }
    
    let toid: string;
    const closed: Record<string, KrakenLikeOrder> = {};
    let urCount = 0;
    const offset = params.ofs || 0;
    
    for (let i = offset; i < offset + 50; i += 1) {
      const oid = oidsRCO[i];
      if (!oid)
        break;
        
      const oo = gemClosed[oid];
      toid = `${oo.id.slice(-10)}K2G1GEMINIGEMINI`;
      toid = `${toid.slice(0, 6)}-${toid.slice(6, 11)}-${toid.slice(11, 17)}`;
      const cost = oo.executed_amount * oo.price;
      
      // const fee = await feeOn(cost);
      const klo: KrakenLikeOrder = {
        refid: null,
        userref: 0,
        cl_ord_id: oo.client_order_id,
        status: oo.break ? `broke:${oo.break}` : "closed",
        opentm: Number(oo.timestamp),
        starttm: 0,
        expiretm: 0,
        descr: { 
          pair: Gclient.inKraken(oo.symbol, true),
          type: oo.side,
          order_type: /limit$/.test(oo.type) ? "limit" : "market",
          price: oo.price,
          price2: 0,
          leverage: "none",
          order: `${oo.side} ${oo.original_amount} ${oo.symbol} @ ${/^market/.test(oo.type) ? "" : "limit"} ${oo.price}`,
          close: ""
        },
        vol: oo.original_amount,
        vol_exec: oo.executed_amount,
        cost: String(cost),
        fee: String(oo.fee),
        price: oo.price,
        stopprice: "0.00000",
        limitprice: "0.00000",
        closetm: oo.timestampms / 1000,
      };
      
      if (!params.userref)
        closed[toid] = klo;
      else if (params.userref === oo.client_order_id) {
        closed[toid] = klo;
        urCount += 1;
      }
    }
    
    return { closed, count: (params.userref ? urCount : gemClosed.length) };
  }

  static strInt(x: string | number): string { 
    return (0.5 + Number(x)).toFixed(0); 
  }

  async readTicker(market: string, receiver: Record<string, any>): Promise<void> {
    if (!this.gemPairs[market]) {
      market = Gclient.inKraken(market);
      if (market === '')
        return;
    }
    
    const ticker = await this.gem.api('v2/ticker', { symbol: market });
    if (ticker) {
      // eslint-disable-next-line no-param-reassign
      receiver[market] = {
        a: [ticker.ask, 0, 0],
        b: [ticker.bid, 0, 0],
        c: [ticker.close, 0],
        v: '',
        p: '',
        t: 0,
        l: [ticker.low, ticker.low],
        h: [ticker.high, ticker.high],
        o: ticker.open
      };
    }
    
    const bna = await this.gem.api('book', {
      symbol: market,
      limit_bids: 1,
      limit_asks: 1
    });
    
    const a = Gclient.strInt(bna.asks[0].amount);
    const b = Gclient.strInt(bna.bids[0].amount);
    receiver[market].a[1] = a;
    receiver[market].a[2] = Number(a).toFixed(3);
    receiver[market].b[1] = b;
    receiver[market].b[2] = Number(b).toFixed(3);
  }

  async addOrder(params: { 
    pair: string; 
    userref: number; 
    type: string; 
    price: string | number; 
    volume: string | number; 
    close?: any 
  }): Promise<any> {
    const { pair, userref, type, price, volume, close } = params;
    const ret = await this.gem.api('order/new', {
      client_order_id: `${userref}u${new Date().toISOString().slice(0, 19)}`,
      symbol: pair,
      amount: String(volume),
      price: String(price),
      side: type,
      type: "exchange limit"
    });
    
    // If there is a close, register it with the WebServices handler.
    // ... TODO
    if (close)
      console.log("Conditional Close not yet supported.");
      
    return ret;
  }

  async simulatePH(gtik: string, interval: number): Promise<any[]> {
    const simulated: any[] = [];
    const intG = interval > 1440 ? '1day' : '1hr';
    const raw = await this.gem.api('v2/candles', { 
      pair: gtik,
      interval: intG 
    });
    
    await raw;
    let records = raw.length;
    const ts = new Date().getTime();
    const mod = ts % interval;
    const lastts = ts - mod;
    const cycle = interval / (intG == '1hr' ? 60 : 1440);
    let toAdd: any[] = [, , , , , , 0];
    
    while (simulated.length < 720 && records > 0) {
      // The first item is the latest and may not be complete.
      // When we hit an integer multiple of ms, we create a new
      // entry.
      const onDay = raw[--records];
      toAdd[2] = Math.max(toAdd[2], onDay[2]) || onDay[2]; // High
      toAdd[3] = Math.min(toAdd[3], onDay[3]) || onDay[3]; // Low
      toAdd[4] = onDay[4]; // Close
      toAdd[5] = 0; // vwav = unknown from Gemini.
      toAdd[6] += onDay[5]; // Volume
      toAdd[7] = 0; // TradeCount also unknown.
      
      if (onDay[0] % (60000 * interval) == 0) {
        toAdd[0] = onDay[0]; // Timestamp
        toAdd[1] = onDay[1]; // Open
        simulated.push(toAdd);
        toAdd = [, , , , , , 0];
      }
    }
    
    return simulated;
  }

  /**
   * Gemini Order Lifecycle mapping:
   * Gemini          | Kraken         | Bot Action
   * ----------------|----------------|------------
   * accepted        | pending        | None
   * live            | open           | None
   * fill (partial)  | open          | Create close
   * fill (complete) | closed         | Create close
   * cancelled       | canceled       | None
   * rejected        | expired        | None
   */
  /* We could derive Kraken-like status:
  function deriveOrderStatus(order: GeminiOrderInfo): KrakenOrderStatus {
      if (order.is_cancelled) return 'canceled';
      if (order.executed_amount === order.original_amount) return 'closed';
      if (order.is_live) {
          return order.executed_amount === '0' ? 'open' : 'partially_filled';
      }
      // Need to confirm what other states are possible
      return 'expired';
  } */
  async api(method: string, params: any = {}): Promise<{ error: string[]; result: any }> {
    const cached = {}; /* k2gtfc.isCached('k2gapi',[method,params]);
    if (process.USECACHE && cached.answer)
      return cached.cached; */
      
    try {
      const errors: string[] = [];
      let ret: any = {};
      
      if (method === 'AssetPairs') {
        if (Object.keys(this.gemPairs).length > 0 && !params.refresh)
          return { error: errors, result: this.gemPairs };
          
        // eslint-disable-next-line no-param-reassign
        if (params)
          delete params.refresh;
          
        ret = await this.AssetPairs();
        Object.assign(this.gemPairs, ret);
      }
      else if (method === 'Assets') {
        ret = await this.fetchAssets();
      }
      else if (method === 'Balance') {
        ret = await this.balances();
      }
      else if (method === 'TradeBalance') {
        ret = { c: 0, v: 0, n: 0 };
      }
      else if (method === 'OpenPositions')
        ret = {};
      else if (method === 'OpenOrders') {
        ret = await this.fetchOrders();
        ret = { open: ret };
      }
      else if (method === 'ClosedOrders') {
        if (params.closetime && params.closetime !== 'close')
          throw new Error("Gemini provides only execution time.");
        ret = await this.fetchClosed(params);
      }
      else if (method === 'Ticker') {
        if (/,/.test(params.pair)) {
          await Promise.all(params.pair.split(',')
            .map(async (p: string) => {
              const gp = Gclient.inKraken(p);
              return await this.readTicker(gp, ret);
            })
          );
        }
        else
          await this.readTicker(params.pair, ret);
      }
      else if (method === 'AddOrder') {
        ret = await this.addOrder(params);
      }
      else if (method === 'order/events') {
        ret = await this.gem.api(method);
      }
      else if (method === 'OHLC') {
        const K2GTimeMap: Record<number, string> = {
          1: '1m', 5: '5m', 15: '15m', 30: '30m',
          60: '1hr', 240: '6hr', 1440: '1day',
          21600: '1day', 10080: '1day'
        };
        const sim = ([240, 21600, 10080].includes(params.interval));
        // If the interval is not available, then we should simulate it
        let raw = await sim
          ? await this.simulatePH(Gclient.inKraken(params.pair), params.interval)
          : await this.gem.api('v2/candles', { 
              pair: Gclient.inKraken(params.pair),
              interval: K2GTimeMap[params.interval] 
            });
            
        raw = await raw;
        ret = sim ? raw : (raw.reverse()).map((rec: any[]) => 
          [rec[0] / 1000, rec[1], rec[2], rec[3], rec[4], rec[4], rec[5], 0]);
        ret = { [Gclient.inKraken(params.pair, true)]: ret };
      }
      else
        console.log(method, params, "???");
        
      // if(!cached || !cached.answer) k2gtfc.store(cached.id,ret);
      return { error: errors, result: ret };
    }
    catch (e: any) {
      return { error: [e.message], result: {} };
    }
  }
}