#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bot = void 0;
/* eslint-disable no-restricted-globals */
/* eslint-disable import/extensions */
/* eslint-disable no-console */
var prompt_sync_1 = require("prompt-sync");
// ({sigint: true});
var safestore_js_1 = require("./safestore.js"); // encrypted sorage
var reports_js_1 = require("./reports.js");
var testFasterCache_js_1 = require("./testFasterCache.js");
var prompt = (0, prompt_sync_1.default)({ sigint: true });
var myConfig = { exch: 'K' };
var Bot = function (config) {
    if (config.bot)
        return config.bot; // Singleton!
    Object.assign(myConfig, config);
    var Savings = myConfig.Savings, AllocCon = myConfig.AllocCon, ClientCon = myConfig.ClientCon;
    var safestore;
    var Reports;
    var pairs = {};
    var tickers = [];
    var Bases;
    var Numeraires;
    var Extra = {};
    var alts = {};
    var exchange;
    var tfc; // So we don't have to use config.bot.tfc
    var portfolio = {}; // A record of what's on the exchange
    var lCOts = 0; // Timestamp for use in collecting executed trades.
    var FLAGS = { safe: true, verbose: process.TESTING, risky: false };
    function getPortfolio() { return portfolio; }
    function getConfig() { return myConfig; }
    function getAlts() { return alts; }
    function getTickers() { return tickers; }
    function getPairs() { return pairs; }
    function getExtra() { return Extra; }
    function toDec(n, places) {
        var f = Math.pow(10, places);
        return Math.round(n * f) / f;
    }
    // Returns a Savings object which includes assets on the exchange.
    function ExchangeSavings() {
        var assets = [];
        Object.keys(portfolio).forEach(function (key) {
            if (tickers.includes(key)
                && Array.isArray(portfolio[key])
                && portfolio[key].length === 4
                && portfolio[key][3] !== 0) {
                assets.push({ ticker: key, amount: toDec(portfolio[key][3], 4) });
            }
        });
        return Savings({ assets: assets, label: 'OnExchange', AllocCon: AllocCon });
    }
    // Store the API keys if they change.
    function keys() {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                safestore.ssUpdate("".concat(portfolio.key, " ").concat(portfolio.secret), false);
                return [2 /*return*/];
            });
        });
    }
    // pairs is the result of calling AssetPairs, so a series of properties
    //  like `PAIR: {altname, base, etc.}`. If you want more than just the
    // property name (the pair, or symbol used by Kraken for that market),
    // you have to pass 1 in as idx. You can pass undefined for quote.
    // TODO: make this function easier to use, like:
    //  findPair('XXBTZUSD', altname) -> 'XBTUSD'.
    function findPair(base, quote, idx) {
        if (quote === void 0) { quote = portfolio.Numeraire; }
        if (idx === void 0) { idx = 0; }
        var gMarket = exchange.inKraken(base + quote).toLowerCase();
        var kBase = exchange.inKraken(base, true);
        var p = Object.entries(pairs).find(function (a) { return a[1].altname === base
            || a[0] === base || alts[base] === a[0]
            || (a[1].quote === quote && ([base, alts[base]].includes(a[1].base)))
            || a[0] === kBase
            || base === exchange.inKraken(a[0])
            || a[0] === gMarket
            || base + quote === exchange.inKraken(a[0], true); });
        if (!p) {
            console.trace("No pair with base ".concat(base, " and quote ").concat(quote, ", in pairs that has ").concat(Object.keys(pairs).length, " keys."));
            return '';
        }
        return idx === -1 ? p : p[idx];
    }
    ;
    // Save changes as they happen in encrypted storage.
    function save() {
        var toSave = {
            key: portfolio.key,
            secret: portfolio.secret,
            savings: portfolio.Savings,
            Alloc: portfolio.Allocation,
            Numeraire: portfolio.Numeraire || 'ZUSD',
            Pairs: Array.from(portfolio.Pairs),
            Closed: portfolio.Closed,
            Extra: Extra,
            limits: portfolio.limits,
            lastUpdate: portfolio.lastUpdate
        };
        safestore.replace(toSave);
        console.log("Updated, saved to disk.", FLAGS.verbose ? toSave : '');
    }
    function showPair(p) {
        console.log("The pair", p, "is: ", pairs[p], "and pairs' length is:", Object.keys(pairs).length);
    }
    function pairInfo(p) {
        return pairs[p];
    }
    function sleep(ms) {
        // When debugging, step INTO this function and wait at the breakpoint below.
        // If you step OVER the await that calls sleep(), JavaScript will continue 
        // executing other code (like the next test file) while waiting for the timeout.
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }
    // Call a Kraken API
    function protectedKapi(arg_1) {
        return __awaiter(this, arguments, void 0, function (arg, sd) {
            var ret, cached, err_1;
            if (sd === void 0) { sd = 5; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cached = tfc.isCached('kapi', arg);
                        if (!(cached.answer && process.USECACHE)) return [3 /*break*/, 1];
                        ret = cached.cached;
                        return [3 /*break*/, 14];
                    case 1:
                        if (!(process.USECACHE === 'must')) return [3 /*break*/, 2];
                        return [2 /*return*/, { result: {
                                    descr: "No Cache for ".concat(cached.id)
                                } }];
                    case 2:
                        _a.trys.push([2, 8, , 14]);
                        if (!Array.isArray(arg)) return [3 /*break*/, 4];
                        return [4 /*yield*/, exchange.api.apply(exchange, arg)];
                    case 3:
                        ret = _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, exchange.api(arg)];
                    case 5:
                        ret = _a.sent();
                        _a.label = 6;
                    case 6: return [4 /*yield*/, sleep(1000)];
                    case 7:
                        _a.sent();
                        return [3 /*break*/, 14];
                    case 8:
                        err_1 = _a.sent();
                        if (!((!/AddOrder/.test(arg[0]) && /ETIMEDOUT|EAI_AGAIN/.test(err_1.code))
                            || /nonce/.test(err_1.message)
                            || /Response code 520/.test(err_1.message)
                            || /Response code 50/.test(err_1.message)
                            || (FLAGS.risky && /Internal error/.test(err_1.message))
                            || /Unavailable/.test(err_1.message)
                            || /Rate limit|Throttled/.test(err_1.message))) return [3 /*break*/, 11];
                        if (sd > 5)
                            console.log(22, "".concat(err_1.message, ", so trying again in ").concat(sd, "s...(").concat(new Date, "):"));
                        if (Array.isArray(arg)) {
                            // eslint-disable-next-line no-param-reassign
                            delete arg[1].nonce;
                            console.log.apply(console, arg);
                        }
                        else {
                            console.log(arg);
                        }
                        return [4 /*yield*/, sleep(sd * 1000)];
                    case 9:
                        _a.sent();
                        return [4 /*yield*/, protectedKapi(arg, sd > 300 ? sd : 2 * sd)];
                    case 10:
                        ret = _a.sent();
                        return [3 /*break*/, 12];
                    case 11:
                        if (/Unknown order/.test(err_1.message) && /CancelOrder/.test(arg[0])) {
                            console.log.apply(console, __spreadArray(["Ignoring: ", err_1.message], arg, false));
                            ret = { result: { descr: "Ignored" } };
                            // For error conditions that can be retried later.
                        }
                        else if (FLAGS.risky && /Insufficient initial margin/.test(err_1.message)) {
                            console.log(172, "".concat(err_1.message, " Maybe next time."));
                            ret = { result: { descr: "Postponed" } };
                        }
                        else {
                            // console.log(174,"API key: ", portfolio.key);
                            throw err_1;
                        }
                        _a.label = 12;
                    case 12: return [4 /*yield*/, sleep(1000)];
                    case 13:
                        _a.sent();
                        return [3 /*break*/, 14];
                    case 14:
                        // if(FLAGS.verbose||!cached) console.log(ret);
                        if (!cached || !cached.answer)
                            tfc.store(cached.id, ret);
                        return [2 /*return*/, ret];
                }
            });
        });
    }
    var mutex = {
        locked: false,
        queue: [],
        lock: function lock() {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!this.locked) return [3 /*break*/, 2];
                            // eslint-disable-next-line no-promise-executor-return
                            return [4 /*yield*/, new Promise(function (resolve) { return _this.queue.push(resolve); })];
                        case 1:
                            // eslint-disable-next-line no-promise-executor-return
                            _a.sent();
                            _a.label = 2;
                        case 2:
                            this.locked = true;
                            return [2 /*return*/];
                    }
                });
            });
        },
        unlock: function unlock() {
            this.locked = false;
            var next = this.queue.shift();
            if (next)
                next();
        }
    };
    function kapi() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, mutex.lock()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 4, 5]);
                        return [4 /*yield*/, protectedKapi.apply(void 0, args)];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4:
                        mutex.unlock();
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    }
    function cachePairs() {
        return __awaiter(this, void 0, void 0, function () {
            var kp, ret;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("Reading Asset Pairs...");
                        return [4 /*yield*/, kapi('AssetPairs')];
                    case 1:
                        kp = _a.sent();
                        ret = {};
                        Object.keys(kp.result).forEach(function (k) {
                            ret[k] = kp.result[k];
                            ret[k].pair = k;
                            ret[kp.result[k].altname] = ret[k];
                        });
                        return [2 /*return*/, ret];
                }
            });
        });
    }
    function cacheTickers() {
        return __awaiter(this, void 0, void 0, function () {
            var kp, ret;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, console.log("Reading Tickers...")];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, kapi('Assets')];
                    case 2:
                        kp = _a.sent();
                        ret = Object.keys(kp.result);
                        ret.forEach(function (t) {
                            if (kp.result[t].altname !== t)
                                alts[kp.result[t].altname] = t;
                        });
                        return [2 /*return*/, ret];
                }
            });
        });
    }
    // init initializes the bot and accepts a password for testing.
    function init() {
        return __awaiter(this, arguments, void 0, function (pwd) {
            var p;
            if (pwd === void 0) { pwd = ""; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tfc = (0, testFasterCache_js_1.default)(process.TESTING, process.argv[2]);
                        // eslint-disable-next-line no-param-reassign
                        config.bot.tfc = tfc; // `this` here is not the object, config.bot is.
                        if (!!exchange) return [3 /*break*/, 4];
                        safestore = (0, safestore_js_1.default)(pwd);
                        // eslint-disable-next-line no-param-reassign
                        config.stored = safestore;
                        return [4 /*yield*/, safestore.read()];
                    case 1:
                        p = _a.sent();
                        Extra = p.Extra || Extra;
                        exchange = new ClientCon(p.key, p.secret, config);
                        // eslint-disable-next-line no-param-reassign
                        config.exchange = exchange;
                        exchange.inKraken = exchange.inKraken
                            || function inKraken(x) { return x; };
                        return [4 /*yield*/, cachePairs()];
                    case 2:
                        pairs = _a.sent();
                        return [4 /*yield*/, cacheTickers()];
                    case 3:
                        tickers = _a.sent();
                        Savings.init(this);
                        // eslint-disable-next-line no-param-reassign
                        config.bot.portfolio = portfolio;
                        portfolio.key = p.key;
                        portfolio.secret = p.secret;
                        portfolio.Savings = p.savings ? p.savings : [];
                        portfolio.Closed = p.Closed || { orders: {}, offset: 0 }; // Must be something for new accounts.
                        portfolio.Pairs = new Set(Array.isArray(p.Pairs) ? p.Pairs : []);
                        portfolio.Tickers = new Set();
                        portfolio.Numeraire = p.Numeraire || exchange.inKraken('ZUSD');
                        portfolio.limits = p.limits ? p.limits : [0, -1];
                        portfolio.lastUpdate = p.lastUpdate ? p.lastUpdate : null;
                        portfolio.Allocation = AllocCon(config, p.Alloc ? p.Alloc.assets : undefined);
                        Reports = (0, reports_js_1.default)(this);
                        _a.label = 4;
                    case 4: return [2 /*return*/, portfolio];
                }
            });
        });
    }
    ;
    // return array of unique values for a property of Pair
    function fromPairs(what) {
        var qc = new Set;
        Object.keys(pairs).forEach(function (key) {
            qc.add(pairs[key][what]);
        });
        return Array.from(qc);
    }
    // Collect all the bases represented in Pairs.
    function basesFromPairs() {
        if (!Bases)
            Bases = fromPairs('base');
        return Bases;
    }
    // Collect all the numeraires represented in Pairs.
    function numerairesFromPairs() {
        if (!Numeraires)
            Numeraires = fromPairs('quote');
        return Numeraires;
    }
    // Create a user reference number.
    function makeUserRef(buysell, market, price) {
        var ret = Number((buysell === 'buy' ? '1' : '0')
            + ("00".concat(Object.keys(pairs)
                .indexOf(findPair(market, portfolio.Numeraire)))).slice(-3)
            + String("000000".concat(price)).replace('.', '').slice(-6));
        if (FLAGS.verbose)
            console.log("Created userref ", ret);
        return ret;
    }
    // Place an order:
    //  buysell indicates whether this is a 'buy' or a 'sell'
    //  market identifies the pair for this trade.
    //  price specifies how much of the quote (what gets paid)
    //      we're willing to pay/receive for one of the base (what's bought or sold)
    //  amt is how much of the base we want to buy or sell
    // lev indicates the level of leverage
    // uref can be used to specify the userreference.
    // closeO is the price at which to close the trade profitably.
    /**
     * @return {Promise<any>}
     */
    function order(buysell_1, market_1, price_1, amt_1) {
        return __awaiter(this, arguments, void 0, function (buysell, market, price, amt, lev, inUref, closeO) {
            var cO, p, a, qCost, ret, uref, pairA, pair, pairO, ticker, quote, nuFactor, maxInNum, d, notTrade, response;
            if (lev === void 0) { lev = 'none'; }
            if (inUref === void 0) { inUref = 0; }
            if (closeO === void 0) { closeO = 0; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cO = Number(closeO);
                        p = Number(price);
                        a = Number(amt);
                        qCost = p * a;
                        ret = '';
                        uref = inUref;
                        pairA = findPair(market, portfolio.Numeraire, -1);
                        pair = pairA[0];
                        pairO = pairA[1];
                        ticker = pairO.base;
                        quote = pairO.quote;
                        nuFactor = portfolio[quote][1];
                        maxInNum = portfolio.limits[1];
                        notTrade = (maxInNum !== -1 && (qCost * nuFactor > maxInNum)
                            || (qCost * nuFactor > 25 && FLAGS.safe));
                        if (pair === "undefined")
                            return [2 /*return*/, "".concat(market, " is not yet supported.")];
                        if (uref === 0)
                            uref = makeUserRef(buysell, market, price);
                        if (pairO.ordermin > a || pairO.costmin > qCost) {
                            console.log("".concat(a + ticker, "@").concat(p, " is too small for the exchange."));
                            return [2 /*return*/, { txid: "", uref: uref }];
                        }
                        if (cO === price)
                            cO = 0;
                        console.log("".concat((notTrade ? "(>$".concat(maxInNum, " not safe, so NOT) ") : '')
                            + buysell, "ing ").concat(a, " ").concat(market, " at ").concat(p, " with leverage ").concat(lev).concat(cO === 0 ? "" : " to close at ".concat(isNaN(cO) ? "".concat(closeO, " is NaN!") : cO), " as ").concat(uref));
                        if (cO > 0 && (buysell === 'buy' ? cO <= price : cO >= price))
                            throw new Error("Close price, ".concat(cO, " is on the wrong side of ").concat(buysell, " at ").concat(price, "!"));
                        if (process.argv[2] === 'fakeTrade') // Just fake it
                            return [2 /*return*/, { txid: 'AAAAA-1234-ZZZ', uref: uref }];
                        ret = ['AddOrder',
                            { pair: pair, userref: uref,
                                type: buysell,
                                ordertype: 'limit',
                                price: p,
                                volume: a,
                                leverage: lev,
                                close: (cO > 0 ? { ordertype: 'limit', price: cO } : null) }];
                        if (!!notTrade) return [3 /*break*/, 3];
                        return [4 /*yield*/, kapi(ret)];
                    case 1:
                        response = _a.sent();
                        d = response.result;
                        if (d) {
                            ret = { txid: d.txid, uref: uref };
                            if (d.descr) {
                                console.log(40, response, d.descr);
                            }
                            else {
                                console.log(40, response, 'No result.descr from kapi');
                            }
                        }
                        else
                            console.log(40, response, "No kapi response.");
                        console.log(42, "Cooling it for a second...");
                        return [4 /*yield*/, sleep(1000)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        console.log(204, p * a * nuFactor, "is not in range:", portfolio.limits);
                        _a.label = 4;
                    case 4:
                        if (!notTrade) return [3 /*break*/, 6];
                        return [4 /*yield*/, sleep(5000)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: return [2 /*return*/, ret];
                }
            });
        });
    }
    // Return a string description of a grid point.
    function gpToStr(gp) {
        return "".concat(gp.userref, ":").concat(gp.buy, "-").concat(gp.sell, " ").concat(gp.bought, "/").concat(gp.sold);
    }
    // Pass a negative numbr for count to collect all orders.
    function moreOrders() {
        return __awaiter(this, arguments, void 0, function (count) {
            var pc, preCount, closed_1, closedIDs;
            if (count === void 0) { count = 5; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pc = portfolio.Closed;
                        preCount = Object.keys(pc.orders).length;
                        _a.label = 1;
                    case 1: return [4 /*yield*/, Reports.getExecuted(count < 0 ? 20
                            : count, portfolio.Closed)];
                    case 2:
                        closed_1 = _a.sent();
                        closedIDs = Object.keys(closed_1.orders);
                        // Store closed orders in portfolio
                        console.log("Had ".concat(preCount, " @ ").concat(pc.offset, ", now ").concat(closedIDs.length, " orders."));
                        portfolio.Closed = closed_1;
                        if (preCount < closedIDs.length || !closed_1.hasFirst) {
                            console.log("(Re-?)Saving ".concat(closedIDs.length, " closed orders @ ").concat(closed_1.offset, "."));
                            save();
                        }
                        _a.label = 3;
                    case 3:
                        if ((count < 0 && !portfolio.Closed.hasFirst)) return [3 /*break*/, 1];
                        _a.label = 4;
                    case 4: return [2 /*return*/, portfolio.Closed];
                }
            });
        });
    }
    // Initialize the grid by reading closed orders if necessary
    function initGrid() {
        return __awaiter(this, void 0, void 0, function () {
            var gPrices, closed_2, closedIDs, counter_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        gPrices = (portfolio === null || portfolio === void 0 ? void 0 : portfolio.G) || [];
                        if (!(gPrices.length === 0)) return [3 /*break*/, 2];
                        console.log("Reading grid from 20 closed orders...");
                        return [4 /*yield*/, moreOrders(20)];
                    case 1:
                        closed_2 = _a.sent();
                        closedIDs = closed_2.keysFwd();
                        if (closedIDs.length > 0) {
                            counter_1 = closedIDs.length - 1;
                            lCOts = closed_2.orders[closedIDs[counter_1]].closetm;
                            console.log("Last five executed orders:");
                            closedIDs.forEach(function (o) {
                                var oo = closed_2.orders[o];
                                var od = oo.descr;
                                var op = od.price;
                                var ur = oo.userref;
                                var cd = new Date(oo.closetm * 1000);
                                var gp = gPrices.find(function (x) { return x.userref === ur; }); // If we already saw this grid point.
                                if (counter_1 < 5) {
                                    console.log(o, ur, op, od.type, od.close, "".concat(cd.getFullYear(), "/").concat(1 + cd.getMonth(), "/").concat(cd.getDate()), cd.getHours(), cd.getMinutes(), cd.getSeconds());
                                }
                                counter_1 -= 1;
                                if (portfolio && portfolio.Pairs) {
                                    var pair2Add = findPair(od.pair);
                                    portfolio.Pairs.add(pair2Add); // Which pairs are in open orders?
                                }
                                if (ur > 0) {
                                    if (!gp) {
                                        gp = { userref: ur, buy: '?', sell: '?', bought: 0, sold: 0 };
                                        gp[od.type] = op;
                                        gp[(od.type === 'buy') ? 'bought' : 'sold'] = Number(oo.vol_exec); // was rv ??
                                        gPrices.push(gp);
                                        if (FLAGS.verbose)
                                            console.log(gp.userref, "(".concat(od.type, ")"), 'buy:', gp.buy, 'sell:', gp.sell);
                                    }
                                    else {
                                        gp[(od.type === 'buy') ? 'bought' : 'sold'] += Number(oo.vol_exec); // was rv ??
                                        gp[od.type] = op;
                                    }
                                }
                            });
                        }
                        _a.label = 2;
                    case 2:
                        portfolio.G = gPrices;
                        return [2 /*return*/];
                }
            });
        });
    }
    // opens: Open orders collected from Kraken
    // oldRefs: The OrderIDs collected previously
    // This function:
    // * Build bSidesR (Refs - which UserRefs have both buys and sells)
    // * Build bSidesP (Pair - to find highest sell and lowest buy for each pair)
    // * Identify orders that are new and orders that are now gone
    // * Create an array of orders ("comps") resulting from conditional closes
    //  so that we can combine them into a new order with its own conditional close.
    // * Update how much of each asset remains available (not reserved for these
    //  open orders).
    // It returns [bSidesR, bSidesP, comps]
    // -----------------------------------------------------------------------------
    function processOpens(opens, oldRefs, isFresh) {
        var bSidesR = [];
        var bSidesP = [];
        var comps = [];
        var opensA = [];
        var pnum = portfolio.Numeraire;
        var gPrices = portfolio.G;
        Object.entries(opens).forEach(function (_a) {
            var _b;
            var _c;
            var o = _a[0], oo = _a[1];
            var od = oo.descr;
            var op = od.price;
            var rv = oo.vol - oo.vol_exec;
            var ur = oo.userref;
            if (ur > 0) {
                // bothSides record for userref
                // ----------------------------
                var bs = bSidesR.find(function (b) { return b.userref === ur; });
                if (!bs) {
                    bs = { userref: ur, buy: false, sell: false, trades: 0 };
                    bSidesR.push(bs);
                }
                bs[od.type] = true;
                bs.trades += 1;
                // bothSides record for grid extension
                // -----------------------------------
                bs = bSidesP.find(function (b) { return b.pair === od.pair; });
                if (!bs) {
                    bs = {
                        pair: od.pair,
                        price: op,
                        buy: od.type === 'buy',
                        sell: od.type === 'sell'
                    };
                    bSidesP.push(bs);
                }
                else if (!bs[od.type]) {
                    bs[od.type] = true;
                }
                else if (bs.buy !== bs.sell) {
                    // Set bs.price to the lowest if there are only sells (bs.sell is true),
                    // or the highest if there are only buys (bs.buy is true).
                    // If both, it won't matter.
                    // --------------------------------------------------
                    if ((bs.buy && Number(bs.price) < Number(op))
                        || (bs.sell && Number(bs.price) > Number(op)))
                        bs.price = op;
                }
            }
            // Record open trades
            // ------------------
            opensA.push([o, oo]);
            var ct = od.type === 'buy' ? 'sell' : 'buy'; // Order's close is of opposite type.
            var cp = 0; // Close Price
            // Record the opening price for use in the closing
            // order of the closing order into which we combine.
            // -------------------------------------------------
            if (od.close && ur > 0) { // Externally added orders have userref=0
                cp = Number((_b = /[0-9.]+$/.exec(od.close)) === null || _b === void 0 ? void 0 : _b[0]) || 0;
                var gp_1 = gPrices.find(function (gprice) { return gprice.userref === ur; });
                if (!gp_1) {
                    gp_1 = { userref: ur, buy: '?', sell: '?', bought: 0, sold: 0 };
                    gPrices.push(gp_1);
                    if (FLAGS.verbose)
                        console.log(329, gp_1.userref, "(".concat(od.type, ")"), 'buy:', gp_1.buy, 'sell:', gp_1.sell);
                }
                gp_1[od.type] = op;
                gp_1[ct] = cp;
            }
            var gp = gPrices.find(function (gprice) { return gprice.userref === ur && ur > 0; });
            cp = gp ? gp[ct] : '?';
            var pair = od.pair;
            var ci = od.pair + od.price + od.type; // pair picks up externals
            if (FLAGS.verbose)
                console.log("comps index: ".concat(ci));
            if (!comps[ci]) {
                if (FLAGS.verbose)
                    console.log("Creating ci for", o);
                comps[ci] = {
                    total: rv,
                    volume: Number(oo.vol),
                    type: od.type,
                    sym: pair,
                    ctype: ct,
                    lev: od.leverage,
                    ids: [o],
                    userref: ur,
                    open: cp,
                    price: od.price,
                    hasClose: Boolean(od.close)
                };
            }
            else {
                if (FLAGS.verbose)
                    console.log("Adding", o);
                comps[ci].total += rv; // Volume for combined order.
                comps[ci].ids.push(o);
                comps[ci].volume += Number(oo.vol); // Volume for extended order.
                // If any of them are missing a close, combine them all
                // ----------------------------------------------------
                (_c = comps[ci]).hasClose && (_c.hasClose = Boolean(od.close));
                // Fix a comp created from an external order.
                // ------------------------------------------
                if (comps[ci].userref === 0)
                    comps[ci].userref = ur;
            }
            if (!od.close) {
                console.log(154, "".concat(od.order, " (").concat(ur, ") had no close."));
            }
            var orid = oldRefs.indexOf(o); // Remove it from oldRefs because it isn't gone.  
            if ((orid) > -1) {
                oldRefs.splice(orid, 1);
            }
            else { // It wasn't in there, so it must be new.
                console.log(159, "New: ", o, opensA.length, od.order, oo.userref, cp);
                // if(FLAGS.verbose) console.log(160,oo);
            }
            if (portfolio && isFresh && od.leverage === "none") {
                if (od.type === "buy") {
                    if (/USD$/.test(od.pair)) { // Deplete our cash
                        portfolio[pnum][2] -= od.price * opens[o].vol; // #USD Refactor and basePair()
                    }
                    else if (/XBT$/.test(od.pair)) { // Deplete our BTC
                        portfolio.XXBT[0] -= od.price * opens[o].vol;
                    }
                }
                else {
                    // Deplete available crypto
                    // ------------------------
                    var p396 = findPair(od.pair, pnum, 1);
                    // console.log({p396});
                    portfolio[p396.base][0] -= opens[o].vol;
                }
            }
        });
        portfolio.O = opensA;
        if (oldRefs.length > 0) {
            console.log("Gone: ".concat(oldRefs));
            // If trades are gone, check for freshly executed orders.
            moreOrders(100);
        }
        return [bSidesR, bSidesP, comps];
    }
    // How to cancel orders, either a TxID, an array of them,
    //  ALL of them (pass 0), or a line number from the list
    //  of orders, or all orders with a particular User
    //  Reference Number.
    function kill(o, oa) {
        return __awaiter(this, void 0, void 0, function () {
            var killed, killAll, idxo;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(o === 0)) return [3 /*break*/, 4];
                        killAll = prompt("Cancel ALL orders? [y/N]");
                        if (!/^y/i.test(killAll)) return [3 /*break*/, 2];
                        return [4 /*yield*/, kapi('CancelAll')];
                    case 1:
                        killed = _a.sent();
                        console.log(314, killed);
                        return [3 /*break*/, 3];
                    case 2:
                        console.log("Maybe be more careful.");
                        _a.label = 3;
                    case 3: return [3 /*break*/, 15];
                    case 4:
                        if (!FLAGS.safe) return [3 /*break*/, 5];
                        console.log("In Safemode(!), so NOT killing ".concat(o));
                        return [3 /*break*/, 15];
                    case 5:
                        if (!(Array.isArray(o) && o.length > 1)) return [3 /*break*/, 7];
                        console.log("Killing", o, '...');
                        return [4 /*yield*/, kapi(['CancelOrderBatch', { orders: o }])];
                    case 6:
                        killed = _a.sent();
                        console.log(546, killed);
                        return [3 /*break*/, 15];
                    case 7:
                        if (!(Array.isArray(o) && o.length > 0)) return [3 /*break*/, 9];
                        console.log("Killing", o[0], '...');
                        return [4 /*yield*/, kapi(['CancelOrder', { txid: o[0] }])];
                    case 8:
                        killed = _a.sent();
                        console.log(568, killed);
                        return [3 /*break*/, 15];
                    case 9:
                        if (!(typeof (o) === 'string' && o.match(/-/))) return [3 /*break*/, 11];
                        console.log("Killing ".concat(o, "..."));
                        return [4 /*yield*/, kapi(['CancelOrder', { txid: o }])];
                    case 10:
                        killed = _a.sent();
                        console.log(320, killed);
                        return [3 /*break*/, 15];
                    case 11:
                        if (!(o < 100000)) return [3 /*break*/, 13];
                        idxo = oa[o - 1];
                        console.log("Killing ".concat(idxo[0], "(described as ").concat(idxo[1].descr.order, "..."));
                        return [4 /*yield*/, kapi(['CancelOrder', { txid: idxo[0] }])];
                    case 12:
                        killed = _a.sent();
                        console.log(325, killed);
                        idxo[0] = "Killed: ".concat(idxo[0]);
                        idxo[1].descr.order = "Killed: ".concat(idxo[1].descr.order);
                        return [3 /*break*/, 15];
                    case 13:
                        console.log("Killing userref ".concat(o, "..."));
                        return [4 /*yield*/, kapi(['CancelOrder', { txid: o }])];
                    case 14:
                        killed = _a.sent();
                        console.log(329, killed);
                        _a.label = 15;
                    case 15: return [2 /*return*/];
                }
            });
        });
    }
    function getPrice(tkr) {
        return __awaiter(this, void 0, void 0, function () {
            var ret, pair, newPrice, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (portfolio[tkr])
                            return [2 /*return*/, portfolio[tkr][1]];
                        if (portfolio.Numeraire === tkr)
                            return [2 /*return*/, 1];
                        if (!Savings.pricers[tkr]) return [3 /*break*/, 2];
                        return [4 /*yield*/, Savings.pricers[tkr].price(tkr)];
                    case 1:
                        ret = _b.sent();
                        return [2 /*return*/, toDec(ret, 2)];
                    case 2:
                        pair = findPair(tkr, portfolio.Numeraire);
                        if (!pair) return [3 /*break*/, 4];
                        return [4 /*yield*/, kapi(["Ticker", { pair: pair }])];
                    case 3:
                        _a = _b.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _a = false;
                        _b.label = 5;
                    case 5:
                        newPrice = _a;
                        if (newPrice)
                            return [2 /*return*/, Object.values(newPrice.result)[0].c[0]];
                        console.log("No way to get price for ".concat(tkr));
                        return [2 /*return*/, 0];
                }
            });
        });
    }
    // howMuch is adapted from the code recently developed
    // for the client that shows how much to trade if the
    // price changes (to np = NewPrice).
    // ---------------------------------------------------
    function howMuch(tkr, np) {
        return __awaiter(this, void 0, void 0, function () {
            var p, dp, _a, desired, adjust, ranges, t, _b, hp, lp, _c, b, ma, f, tot1, ov, tt, a, t2, t2s, a2;
            var _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0: return [4 /*yield*/, getPrice(tkr)];
                    case 1:
                        p = _e.sent();
                        dp = (np - p) / p;
                        return [4 /*yield*/, portfolio.Allocation.Allocations()];
                    case 2:
                        _a = _e.sent(), desired = _a[1], adjust = _a[2], ranges = _a[3];
                        t = portfolio.Allocation.getTotal();
                        _b = ranges[tkr] || [0, 0], hp = _b[0], lp = _b[1];
                        _c = (adjust[tkr]
                            ? adjust[tkr].split('+')
                            : [desired[0], 0]).map(Number), b = _c[0], ma = _c[1];
                        f = Math.min(1, (hp - Math.min(hp, np)) / (hp - lp));
                        tot1 = 0;
                        ov = 0;
                        tt = {};
                        // If new price beyond range, adjust range, recalculate factor.
                        if (np > hp || np < lp) {
                            _d = [hp, lp].map(function (x) { return x * (np / (np < lp ? lp : hp)); }), hp = _d[0], lp = _d[1];
                            f = Math.min(1, (hp - Math.min(hp, np)) / (hp - lp));
                        }
                        Array.from(portfolio.Tickers)
                            .forEach(function (pt) {
                            tt[pt] = portfolio[pt];
                        });
                        portfolio.Savings.forEach(function (s) {
                            s.assets.forEach(function (aa) {
                                tot1 += aa.ticker === tkr ? aa.amount : 0;
                                ov += [tkr, 'ZUSD'].includes(aa.ticker) ? 0 : aa.amount;
                            });
                        });
                        Object.keys(tt).forEach(function (s) {
                            ov += [tkr, 'ZUSD'].includes(s)
                                ? 0
                                : tt[s][3] * tt[s][1];
                        });
                        a = tot1 + tt[tkr][3];
                        t2 = t + (dp * (p * a + ov));
                        t2s = t + (dp * p * a);
                        a2 = (b + ma * f) * t2 / np;
                        console.log("[p,np,dp,t,hp,lp,b,ma,f,tot1,ov,a,a2,t2,t2s]:", [p, np, dp, t, hp, lp, b, ma, f, tot1, ov, a, a2, t2, t2s]);
                        return [2 /*return*/, a2 - a];
                }
            });
        });
    }
    // getLev is NOT idempotent: It depletes availability.
    // ---------------------------------------------------
    function getLev(portfolio2, buysell, price, amt, market, posP) {
        var lev = 'none';
        var pnum = portfolio.Numeraire;
        var psym = findPair(market, pnum, 1).base;
        if (buysell === 'buy') {
            if (1 * price > 1 * portfolio[psym][1] && posP)
                return "Buying ".concat(market, " @ ").concat(price, " isn't a limit order.");
            if (price * amt > 1 * portfolio[pnum][2]) { // #USD Refactor - This doesn't support leverage
                lev = '2'; // on non-USD pairs. Hunt ZUSD and add basePair(pair) to get base.
            }
            else {
                portfolio[pnum][2] -= price * amt; // #USD Refactor and basePair()
            }
        }
        else {
            if (price * 1 < 1 * portfolio[psym][1] && posP)
                return "Selling ".concat(market, " @ ").concat(price, " isn't a limit order.");
            // console.log("We have "+portfolio[market][2]+" "+market);
            if (amt * 1 > 1 * portfolio[psym][2]) {
                lev = '2';
            }
            else {
                portfolio[psym][2] -= amt;
            }
            // console.log("Now we have "+portfolio[market][2]+" "+market);
        }
        if (FLAGS.verbose)
            console.log("Leverage will be ".concat(lev));
        return lev;
    }
    // We want extend() to update allocation for ranges
    // and thereby set the amount properly.
    // ------------------------------------------------
    function listOpens() {
        return __awaiter(this, arguments, void 0, function (isFresh) {
            var response, opens, comps, bSidesR, bSidesP, pnum, gPrices, oldRefs, nexes, usdEntries;
            var _a;
            var _this = this;
            if (isFresh === void 0) { isFresh = false; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, kapi('OpenOrders')];
                    case 1:
                        response = _b.sent();
                        opens = response.result.open;
                        comps = [];
                        bSidesR = [];
                        bSidesP = [];
                        pnum = portfolio.Numeraire;
                        // Index for comps, Closing Price, index to grid prices,
                        // and bs is "both sides", holding an array of objects
                        // holding userref, and two booleans, buy and sell.
                        if (Object.keys(opens).length === 0) {
                            console.log("There are no open orders.");
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, initGrid()];
                    case 2:
                        _b.sent(); // Also sets portfolio['G'] (the grid).
                        gPrices = portfolio.G;
                        oldRefs = [];
                        if (portfolio && portfolio.O) {
                            portfolio.O.forEach(function (x) { oldRefs.push(x[0]); });
                        }
                        // With the list of open orders (opens) we will:
                        // * Build bSidesR (Refs - which UserRefs have both buys and sells)
                        // * Build bSidesP (Pair - to find highest sell and lowest buy for each pair)
                        // * Identify orders that are new and orders that are now gone
                        // * Create an array of orders ("comps") resulting from conditional closes
                        //  so that we can combine them into a new order with its own conditional close.
                        // * Update how much of each asset remains available (not reserved for these
                        //  open orders).
                        _a = processOpens(opens, oldRefs, isFresh), bSidesR = _a[0], bSidesP = _a[1], comps = _a[2];
                        nexes = 0;
                        usdEntries = Object.entries(comps).filter(function (_a) {
                            var comp = _a[0];
                            return /USD/.test(comp);
                        });
                        return [4 /*yield*/, Promise.all(usdEntries.map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var bs, pair, sym, price, gp, traded, dp, decimals, ngp, sp, bp, newVol, _c, newVol;
                                var _d;
                                var comp = _b[0], c = _b[1];
                                return __generator(this, function (_e) {
                                    switch (_e.label) {
                                        case 0:
                                            gp = gPrices.find(function (gprice) { return gprice.userref === c.userref; });
                                            bs = bSidesR.find(function (b) { return b.userref === c.userref; });
                                            if (!gp) {
                                                gp = { userref: c.userref, buy: '?', sell: '?', bought: 0, sold: 0 };
                                                gPrices.push(gp);
                                                console.log(gp.userref, "(".concat(comp.slice(-4), ")"), 'buy:', gp.buy, 'sell:', gp.sell);
                                            }
                                            gp[c.ctype] = String(c.open);
                                            gp[c.type] = c.price;
                                            _d = /([A-Z]+)([0-9.]+)/.exec(comp) || ['', '', ''], pair = _d[1], price = _d[2];
                                            sym = pairs[pair].base;
                                            if (FLAGS.verbose)
                                                console.log("Checking: ".concat(c.type, " ").concat(sym, " ").concat(price, " ").concat(toDec(c.total, 4)).concat(c.open ? " to ".concat(c.ctype, "-close @").concat(c.open) : '', " (").concat(c.userref, "):"));
                                            if (!!isNaN(c.open)) return [3 /*break*/, 14];
                                            if (!!c.hasClose) return [3 /*break*/, 3];
                                            console.log(421, Object.values(c.ids));
                                            return [4 /*yield*/, kill(c.ids.length > 1 ? c.ids : c.ids[0], portfolio.O)];
                                        case 1:
                                            _e.sent();
                                            return [4 /*yield*/, order(c.type, sym, price, toDec(c.total, 4), c.lev, c.userref, c.open)];
                                        case 2:
                                            _e.sent();
                                            if (FLAGS.verbose)
                                                console.log(425, { buysell: c.type, sym: sym, price: price, lev: c.lev, ur: c.userref, close: c.open });
                                            // eslint-disable-next-line no-param-reassign
                                            c.hasClose = true;
                                            traded = c.type === 'buy' ? 'sold' : 'bought';
                                            gp[traded] += c.total;
                                            _e.label = 3;
                                        case 3:
                                            // Do we need to extend the grid?
                                            // If we don't have a buy and a sell, then yes.
                                            // --------------------------------------------
                                            bs = bSidesP.find(function (b) { return b.pair === c.sym; }); // Was sym+'USD' but #USD Refactor
                                            if (!(bs && bs.buy && bs.sell)) return [3 /*break*/, 4];
                                            // console.log("Still between buy and sell.");
                                            nexes += 1;
                                            return [3 /*break*/, 14];
                                        case 4:
                                            if (!(bs && bs.price === c.price)) return [3 /*break*/, 14];
                                            if (gp.sell - gp.buy <= 0) {
                                                console.log("Somethig is wrong with this grid:\n", JSON.stringify(gPrices));
                                                return [2 /*return*/];
                                            }
                                            dp = gp.buy.indexOf('.');
                                            decimals = Math.pow(10, (dp > 0
                                                ? gp.buy.length - dp - 1
                                                : 0));
                                            ngp = void 0;
                                            sp = void 0;
                                            bp = void 0;
                                            if (!bs.buy) return [3 /*break*/, 10];
                                            _e.label = 5;
                                        case 5:
                                            sp = Math.round(decimals * gp.sell * gp.sell / gp.buy) / decimals;
                                            // eslint-disable-next-line no-param-reassign
                                            c.userref = makeUserRef('sell', c.sym, sp);
                                            // We may already have this grid price but the order
                                            // was deleted, so search for it first.
                                            ngp = gPrices.find(function (n) { return n.userref === c.userref; });
                                            if (!ngp) {
                                                ngp = { userref: c.userref,
                                                    buy: gp.sell,
                                                    sell: String(sp),
                                                    bought: 0, sold: 0 };
                                                gPrices.push(ngp);
                                                console.log(ngp.userref, '(sell)', 'buy:', ngp.buy, 'sell:', ngp.sell);
                                                console.log(249, "sell ".concat(c.sym, " ").concat(sp, " ").concat(c.volume, " to close at ").concat(gp.sell));
                                            }
                                            _c = -1;
                                            return [4 /*yield*/, howMuch(sym, sp)];
                                        case 6:
                                            newVol = _c * (_e.sent());
                                            if (newVol < 0) {
                                                console.log("At", sp, "you'd have to 'sell'", "".concat(newVol, ", which means we're way out of balance."));
                                                return [2 /*return*/];
                                            }
                                            // eslint-disable-next-line no-await-in-loop
                                            return [4 /*yield*/, order('sell', c.sym, sp, newVol, getLev(portfolio, 'sell', sp, newVol, c.sym, false), c.userref, gp.sell)];
                                        case 7:
                                            // eslint-disable-next-line no-await-in-loop
                                            _e.sent();
                                            gp = ngp;
                                            _e.label = 8;
                                        case 8:
                                            if (sp <= 1 * portfolio[findPair(c.sym, pnum, 1).base][1]) return [3 /*break*/, 5];
                                            _e.label = 9;
                                        case 9: return [3 /*break*/, 14];
                                        case 10:
                                            bp = Math.round(decimals * gp.buy * gp.buy / gp.sell) / decimals;
                                            // eslint-disable-next-line no-param-reassign
                                            c.userref = makeUserRef('buy', c.sym, bp);
                                            // We may already have this grid price but the order
                                            // was deleted, so search for it first.
                                            ngp = gPrices.find(function (n) { return n.userref === c.userref; });
                                            if (!ngp) {
                                                ngp = { userref: c.userref,
                                                    buy: String(bp),
                                                    sell: gp.buy,
                                                    bought: 0, sold: 0 };
                                                gPrices.push(ngp);
                                                console.log(ngp.userref, '( buy)', 'buy:', ngp.buy, 'sell:', ngp.sell);
                                                console.log(264, "buy ".concat(c.sym, " ").concat(bp, " ").concat(c.volume, " to close at ").concat(gp.buy));
                                                if (ngp.buy === ngp.sell)
                                                    throw new Error("Bad Grid Point");
                                            }
                                            return [4 /*yield*/, howMuch(sym, bp)];
                                        case 11:
                                            newVol = _e.sent();
                                            if (newVol < 0) {
                                                console.log("At", bp, "you'd have to 'buy'", "".concat(newVol, ", which means we're way out of balance."));
                                                return [2 /*return*/];
                                            }
                                            // eslint-disable-next-line no-await-in-loop
                                            return [4 /*yield*/, order('buy', c.sym, bp, newVol, getLev(portfolio, 'buy', bp, newVol, c.sym, false), c.userref, gp.buy)];
                                        case 12:
                                            // eslint-disable-next-line no-await-in-loop
                                            _e.sent();
                                            gp = ngp;
                                            _e.label = 13;
                                        case 13:
                                            if (bp >= 1 * portfolio[findPair(c.sym, pnum, 1).base][1]) return [3 /*break*/, 10];
                                            _e.label = 14;
                                        case 14: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 3:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    }
    // How to adjust the size of one or more trades.
    function lessmore(less_1, oid_1, amt_1) {
        return __awaiter(this, arguments, void 0, function (less, oid, amt, all) {
            var opensA, matches, newAmt, partial, sym, cp, lev, _a, o_1, diff;
            if (all === void 0) { all = null; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        opensA = portfolio.O;
                        matches = [];
                        if (!opensA[oid]) {
                            console.log("Order ".concat(oid, " not found."));
                            return [2 /*return*/];
                        }
                        if (all) {
                            _a = opensA[oid], o_1 = _a[1];
                            matches = opensA.filter(function (oae) {
                                var io = oae[1];
                                return io.descr.pair === o_1.descr.pair
                                    && Math.round(o_1.vol * 1000) === Math.round(io.vol * 1000);
                            });
                        }
                        else {
                            matches.push(opensA[oid]);
                        }
                        diff = (less ? -1 : 1);
                        return [4 /*yield*/, Promise.all(matches.map(function (_a) {
                                var _b;
                                var oRef = _a[0], o = _a[1];
                                // If some has been executed, then we won't replace the old one.
                                // The old one's original volume might be needed to extend the grid.
                                // -----------------------------------------------------------------
                                partial = o.vol_exec > 0;
                                if (!/USD$/.test(o.descr.pair)) { // #USD Refactor
                                    console.log("Size update to non-USD orders is not yet supported.");
                                    return;
                                }
                                if (partial && diff === -1) {
                                    console.log("Skipping", o.descr.order, "because of partial execution.", o);
                                }
                                else if (!o.descr.close) {
                                    console.log("Skipping", o.descr.order, "because it has no close.", o.descr);
                                }
                                else {
                                    _b = /(.*)USD$/.exec(o.descr.pair) || ['', ''], sym = _b[1];
                                    cp = (/ [0-9.]+$/.exec(o.descr.close) || ['', ''])[0];
                                    lev = o.descr.leverage[0] === 'n' ? "none" : '2';
                                    newAmt = Number(o.vol) + diff * Number(amt);
                                    if (newAmt < 0) {
                                        console.log("Skipping", o.descr.order, "because amount would go negative.", o.descr);
                                    }
                                    else {
                                        console.log("To: ", o.descr.type, sym, o.descr.price, newAmt, cp);
                                        kill(oRef, portfolio.O);
                                        order(o.descr.type, sym, o.descr.price, newAmt, lev, o.userref, cp);
                                    }
                                }
                            }))];
                    case 1:
                        _b.sent();
                        if (FLAGS.verbose)
                            console.log("Lessmore called with ", oid, amt, all);
                        return [2 /*return*/];
                }
            });
        });
    }
    function marginReport() {
        return __awaiter(this, arguments, void 0, function (show) {
            var positions, brief;
            if (show === void 0) { show = true; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, kapi(['OpenPositions', { consolidation: "market", ctr: 60 }])];
                    case 1:
                        positions = _a.sent();
                        brief = [];
                        if (Object.keys(positions.result).length) {
                            try {
                                positions.result.forEach(function (pos) {
                                    var vol = (1 * pos.vol - 1 * pos.vol_closed) * (pos.type === 'sell' ? -1 : 1);
                                    var pair = findPair(pos.pair, '', 1);
                                    var sym = pair.base;
                                    var cost = Number(pos.cost);
                                    vol = toDec(vol, 8);
                                    brief[sym] = {
                                        open: vol,
                                        pair: pos.pair,
                                        cost: cost,
                                        margin: pos.margin
                                    };
                                });
                                if (show)
                                    console.log(475, brief);
                            }
                            catch (e) {
                                console.trace(e, positions.result);
                            }
                        }
                        return [2 /*return*/, brief];
                }
            });
        });
    }
    function w(n, x) {
        var s = n.toString();
        return x > s.length
            ? s + ' '.repeat(x - s.length)
            : s;
    }
    function report() {
        return __awaiter(this, arguments, void 0, function (showBalance) {
            var balP, tikP, marP, _a, bal, trb, mar, tik, price, ts, zeroes, mCosts;
            if (showBalance === void 0) { showBalance = true; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, kapi('Balance')];
                    case 1:
                        balP = _b.sent();
                        return [4 /*yield*/, kapi(['TradeBalance', { ctr: 30 }])];
                    case 2:
                        tikP = _b.sent();
                        marP = marginReport(false);
                        return [4 /*yield*/, Promise.all([balP, tikP, marP])];
                    case 3:
                        _a = _b.sent(), bal = _a[0], trb = _a[1], mar = _a[2];
                        portfolio.M = mar;
                        portfolio.lastUpdate = new Date;
                        Object.keys(bal.result).forEach(function (p) {
                            if (p !== portfolio.Numeraire)
                                portfolio.Pairs.add(findPair(p, portfolio.Numeraire) || 'XXBTZUSD');
                        });
                        return [4 /*yield*/, kapi(['Ticker', { pair: portfolio.Pairs.size > 0
                                        ? (Array.from(portfolio.Pairs)).sort().join().replace(/,,+|^,|,$/g, ',')
                                        : 'XXBTZUSD' }])];
                    case 4:
                        tik = _b.sent();
                        portfolio.Allocation.setRanges(tik.result);
                        zeroes = [];
                        mCosts = [];
                        // Sometimes the first request for balances lists a quote from
                        // a margin position  after the position's crypto, and this
                        // means portfolio[quote-symbol] doesn't yet exist, so we can't
                        // adjust it to reflect the position.  We keep track of those
                        // position costs in mCosts.
                        // ------------------------------------------------------------
                        Object.keys(bal.result).forEach(function (p) {
                            var sym = p;
                            var amt = toDec(bal.result[p], 4);
                            var q;
                            if (p !== portfolio.Numeraire) {
                                ts = findPair(p, portfolio.Numeraire);
                            }
                            if (ts) {
                                if (alts[ts])
                                    ts = alts[ts];
                                if (ts in tik.result)
                                    price = tik.result[ts].c[0];
                            }
                            else {
                                if (FLAGS.verbose)
                                    console.log("Using 1 as value of", p);
                                price = 1;
                            }
                            price = toDec(price, (sym === 'EOS' ? 4 : 2));
                            portfolio[sym] = [amt, price, amt, amt];
                            portfolio.Tickers.add(sym);
                            // holdings w/reserves, price, holdings w/o reserves
                            // [3] will include reserves and margin:
                            if (mar[sym]) {
                                portfolio[sym][0] = toDec(portfolio[sym][0] + mar[sym].open, 4);
                                portfolio[sym][3] = amt + Number(mar[sym].open);
                                q = findPair(mar[sym].pair, '', 1).quote;
                                mCosts[q] = (mar[sym].open < 0 ? 1 : -1) * mar[sym].cost
                                    + (mCosts[q] || 0);
                            }
                            if (amt > 0 && showBalance)
                                console.log("".concat(p, "\t").concat(w(portfolio[sym][0], 16)).concat(price));
                            else if (amt === 0)
                                zeroes.push(p);
                        });
                        // A new account might not have any units of the numeraire.  Mine didn't.
                        // The code relies on the existing balance to create the property in
                        // the portfolio, so we do it manually if it isn't there yet.
                        // ----------------------------------------------------------------------
                        if (!portfolio[portfolio.Numeraire])
                            portfolio[portfolio.Numeraire] = [0, 1, 0, 0];
                        Object.entries(mCosts).forEach(function (_a) {
                            var sym = _a[0], cost = _a[1];
                            if (isNaN(mCosts[sym]))
                                throw new Error("Problem with ".concat(sym, ", ").concat(mCosts[sym], " in mCosts (895): "));
                            portfolio[sym][3] += mCosts[sym];
                        });
                        // The price of the numeraire is always 1
                        // --------------------------------------
                        portfolio[portfolio.Numeraire][1] = 1;
                        // If assets has only one element, this is our chance to 
                        // correct it to reflect all assets on the exchange.
                        // -----------------------------------------------------
                        if (portfolio.Allocation.assets.length < 2)
                            portfolio.Allocation.getAllocation(false, false);
                        if (showBalance) {
                            console.log("Cost\t".concat(trb.result.c));
                            console.log("Value\t".concat(trb.result.v));
                            console.log("P & L\t".concat(trb.result.n));
                            Object.keys(mar).forEach(function (s) {
                                if (portfolio[s]) {
                                    console.log("".concat(s, ": ").concat(portfolio[s][2], " outright, and ").concat(mar[s].open, " on margin."));
                                }
                                else {
                                    console.log("Did not find ".concat(s, " in portfolio!"));
                                }
                            });
                        }
                        if (zeroes.length > 0 && showBalance)
                            console.log("0-unit assets skipped: ", zeroes.join(','));
                        // console.log(portfolio);
                        // showState();
                        return [4 /*yield*/, listOpens(true)];
                    case 5:
                        // console.log(portfolio);
                        // showState();
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    }
    // How to see a list of orders, open or closed.
    function list(args) {
        return __awaiter(this, void 0, void 0, function () {
            var sortedA, orders, count_1, ur_1, early, closed_3, isMore;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (args[1] === '?') {
                            console.log("Usage: list [X] [ur]\n" +
                                "X can be C or CR to see closed orders, and if so, then\n" +
                                "ur can be a userref and only those trades will be listed.\n" +
                                "If ur is less than 10000, it will tell the bot how many\n" +
                                "closed orders to return. To collect early orders, use a\n" +
                                "negative number. To ignore locally stored orders, use CR.\n" +
                                "X can also be a ticker (UPPER CASE) to see orders for it.\n" +
                                "Otherwise, X can be userref, opentm, vol, vol_exec, price,\n" +
                                "or userref and this will cause the specified field to be\n" +
                                "listed first, and the list to be ordered by that field.");
                            return [2 /*return*/];
                        }
                        if (!!portfolio.O) return [3 /*break*/, 2];
                        return [4 /*yield*/, report(false)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        sortedA = [];
                        orders = portfolio.O;
                        if (!['C', 'CR'].includes(args[1])) return [3 /*break*/, 4];
                        if (args[1] === 'CR') {
                            console.log("Restting closed orders record.");
                            portfolio.Closed = { orders: {}, offset: 0 };
                            if (portfolio.Extra)
                                delete portfolio.Extra.gemClosed;
                            save();
                            return [2 /*return*/];
                        }
                        count_1 = 50;
                        ur_1 = args[2] ? Number(args.pop()) : 0;
                        early = ur_1 < 0;
                        if (ur_1 && !isNaN(ur_1) && ur_1 < 10000) {
                            count_1 = Math.abs(ur_1);
                            ur_1 = 0;
                        }
                        orders = [];
                        return [4 /*yield*/, moreOrders(early ? -1 : count_1)];
                    case 3:
                        closed_3 = _a.sent();
                        (early ? closed_3.keysFwd() : closed_3.keysBkwd())
                            .forEach(function (o) {
                            var oo = closed_3.orders[o];
                            if (orders.length < count_1 && (!ur_1 || oo.userref === ur_1))
                                orders.push([o, oo]);
                        });
                        console.log("Orders.length:", orders.length, "Era:", early ? "Earliest" : "Latest");
                        // Either way, we display the latest at the bottom by:
                        if (!closed_3.forward)
                            orders.reverse();
                        args.pop();
                        isMore = !portfolio.Closed.hasFirst;
                        console.log("We have collected ".concat(isMore
                            ? portfolio.Closed.keysFwd().length : "all", " orders. ").concat(isMore ? "Try again for more." : ""));
                        _a.label = 4;
                    case 4:
                        orders.forEach(function (x, i) {
                            var ld = x[1].descr;
                            var partDone = ![x[1].vol, "0.00000000"].includes(x[1].vol_exec);
                            var ldo = partDone
                                ? "".concat(ld.type, " ").concat(x[1].vol_exec, " ").concat(ld.pair, " @ limit ").concat(x[1].price)
                                : ld.order;
                            if (args.length === 1 || RegExp(args[1]).test(ldo))
                                console.log("".concat(x[0], " ").concat(i + 1, " ").concat(ldo, " ").concat(x[1].userref, " ").concat((partDone || x[1].status === "closed")
                                    ? new Date(1000 * x[1].closetm).toISOString()
                                    : x[1].descr.close));
                            else if (x[1][args[1]])
                                sortedA[i + 1] = x;
                            else if (x[1].descr[args[1]])
                                sortedA[i + 1] = x;
                        });
                        if (sortedA.length > 0) {
                            sortedA.sort(function (a1, b1) {
                                var a;
                                var b;
                                if (a1[1].descr[args[1]]) {
                                    a = a1[1].descr[args[1]];
                                    b = b1[1].descr[args[1]];
                                }
                                else {
                                    a = a1[1][args[1]];
                                    b = b1[1][args[1]];
                                }
                                return isNaN(a)
                                    ? a.localeCompare(b)
                                    : a - b;
                            });
                            console.log("Outputting sortedA...");
                            sortedA.forEach(function (x, i) {
                                var ldo = x[1].descr.order;
                                console.log(i + 1, x[1].descr[args[1]]
                                    ? x[1].descr[args[1]] : x[1][args[1]], ldo, x[1].userref, x[1].descr.close);
                            });
                        }
                        ;
                        return [2 /*return*/];
                }
            });
        });
    }
    // How to recreate an order with the correct userref.
    function refnum(opensA, oid, newRef) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, oRef, o, bs, sym, p, amt, lev;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!opensA[oid]) {
                            console.log("Order ".concat(oid, " not found."));
                            return [2 /*return*/];
                        }
                        _a = opensA[oid], oRef = _a[0], o = _a[1];
                        if (!/USD$/.test(o.descr.pair)) {
                            console.log("Userref update to non-USD pairs is not yet supported.");
                            return [2 /*return*/];
                        }
                        if (!(o.userref === 0)) return [3 /*break*/, 3];
                        bs = o.descr.type;
                        sym = (/^([A-Z]+)USD/.exec(o.descr.pair) || ['', ''])[1];
                        p = o.descr.price;
                        amt = toDec(Number(o.vol) - Number(o.vol_exec), 4);
                        lev = o.descr.leverage[0] === 'n' ? "none" : '2';
                        console.log("Attempting ".concat(bs, " ").concat(sym, " ").concat(p, " ").concat(amt, " ").concat(lev, " ").concat(newRef, "..."));
                        return [4 /*yield*/, kill(oid + 1, opensA)];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, order(bs, sym, p, amt, lev, newRef)];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        console.log("".concat(oRef, " already has userref ").concat(o.userref));
                        _b.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    }
    // How to alter an order so we don't borrow to execute it.
    function deleverage(opensA_1, oid_1) {
        return __awaiter(this, arguments, void 0, function (opensA, oid, undo) {
            var placed, _a, oRef, o;
            if (undo === void 0) { undo = false; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!opensA[oid]) {
                            console.log("Order ".concat(oid, " not found."));
                            return [2 /*return*/];
                        }
                        _a = opensA[oid], oRef = _a[0], o = _a[1];
                        if (!/USD$/.test(o.descr.pair)) {
                            console.log("Creating/deleveraging non-USD pairs is not yet supported.");
                            return [2 /*return*/];
                        }
                        // eslint-disable-next-line no-bitwise
                        if (undo !== (o.descr.leverage === 'none')) {
                            console.log("".concat(oRef, " is ").concat(undo ? "already leveraged" : "not leveraged."));
                            return [2 /*return*/];
                        }
                        if (!!o.descr.close) return [3 /*break*/, 2];
                        return [4 /*yield*/, order(o.descr.type, (/^([A-Z]+)USD/.exec(o.descr.pair) || [])[1], o.descr.price, toDec(Number(o.vol) - Number(o.vol_exec), 4), (undo ? '2' : 'none'), o.userref)];
                    case 1:
                        placed = _b.sent();
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, order(o.descr.type, (/^([A-Z]+)USD/.exec(o.descr.pair) || [])[1], o.descr.price, toDec(Number(o.vol) - Number(o.vol_exec), 4), (undo ? '2' : 'none'), o.userref, Number((/[0-9.]+$/.exec(o.descr.close) || [])[0]))];
                    case 3:
                        placed = _b.sent();
                        _b.label = 4;
                    case 4:
                        if (!(placed.txid
                            && /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/.test(placed.txid))) return [3 /*break*/, 6];
                        return [4 /*yield*/, kill(oid + 1, opensA)];
                    case 5:
                        _b.sent();
                        _b.label = 6;
                    case 6: return [2 /*return*/];
                }
            });
        });
    }
    // How to set the price of a grid point
    function set(ur, type, price) {
        return __awaiter(this, void 0, void 0, function () {
            var p, gp, count, once, since, haveAll, closed, profits;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        p = portfolio;
                        if (ur && price) {
                            gp = p.G.find(function (g) { return g.userref === ur; });
                            if (!gp) {
                                gp = { userref: Number(ur), buy: '?', sell: '?' };
                                p.G.push(gp);
                            }
                            console.log(405, gp);
                            gp[type] = price;
                        }
                        p.G.sort(function (a, b) { return a.userref - b.userref; });
                        count = 0;
                        once = false;
                        since = lCOts;
                        haveAll = false;
                        return [4 /*yield*/, moreOrders(50)];
                    case 1:
                        closed = _a.sent();
                        // eslint-disable-next-line no-param-reassign
                        p.Closed = closed;
                        // If p.Closed.hasFirst, then we have
                        //  collected all completed orders and we can search them
                        //  for this Userref.
                        if (p.Closed.hasFirst) {
                            haveAll = true;
                            once = false; // We have everything, so we can update all grid points.
                            if (!once)
                                console.log("All orders have been retrieved.");
                        }
                        profits = 0;
                        return [4 /*yield*/, Promise.all(p.G.map(function (x) { return __awaiter(_this, void 0, void 0, function () {
                                var f, data, drc, datad, closePrice, aur_1, close_1, data2, drc2, s2;
                                var _a, _b;
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            since = new Date().getTime() / 1000;
                                            f = toDec(((x.sell - x.buy) * Math.min(x.bought, x.sold)), 2);
                                            if (!(!isNaN(f) && (once || x.since))) return [3 /*break*/, 1];
                                            profits += f;
                                            return [3 /*break*/, 7];
                                        case 1:
                                            if (!(!once && !x.open && x.userref !== 0)) return [3 /*break*/, 7];
                                            if (!!haveAll) return [3 /*break*/, 5];
                                            once = true;
                                            return [4 /*yield*/, kapi(['ClosedOrders', { userref: x.userref }])];
                                        case 2:
                                            data = _c.sent();
                                            drc = ((_a = data.result) === null || _a === void 0 ? void 0 : _a.closed) || {};
                                            closePrice = void 0;
                                            // eslint-disable-next-line no-param-reassign
                                            x.bought = 0;
                                            x.sold = 0;
                                            if (!(drc && Object.values(drc).length > 0)) return [3 /*break*/, 4];
                                            count = data.result.count;
                                            close_1 = Object.values(drc)[0].descr.close;
                                            if (!close_1) return [3 /*break*/, 4];
                                            closePrice = Number(close_1.match(/[0-9.]+/)[0]);
                                            aur_1 = RegExp("1?[0-9]{3}".concat(String(closePrice).replace('.', '')));
                                            aur_1 = p.G.find(function (x2) { return aur_1.test(x2.userref) && x !== x2; });
                                            if (!(aur_1 && aur_1.buy === x.buy)) return [3 /*break*/, 4];
                                            // eslint-disable-next-line no-param-reassign
                                            x.aur = aur_1.userref;
                                            aur_1.aur = x.userref;
                                            return [4 /*yield*/, kapi(['ClosedOrders', { userref: x.aur }])];
                                        case 3:
                                            data2 = _c.sent();
                                            drc2 = ((_b = data2.result) === null || _b === void 0 ? void 0 : _b.closed) || {};
                                            Object.assign(drc, drc2);
                                            count += data2.result.count;
                                            _c.label = 4;
                                        case 4:
                                            console.log("Retrieved", count, "closed orders for", "".concat(x.userref, "."));
                                            return [3 /*break*/, 6];
                                        case 5:
                                            // Include orders if they are sells with a close at the buy
                                            //  price or buys with a close at the sell price.
                                            drc = Object.fromEntries(Object.entries(p.Closed.orders).filter(function (o) {
                                                return (!o[0].includes('-') ? false :
                                                    ((Number(x.buy) === Number(o[1].descr.close.match(/[0-9.]+/)[0])
                                                        && o[1].descr.type === 'sell')
                                                        || (Number(x.sell) === Number(o[1].descr.close.match(/[0-9.]+/)[0])
                                                            && o[1].descr.type === 'buy')));
                                            }));
                                            if (FLAGS.verbose)
                                                console.log(drc.length, "found from", x.buy, "to", x.sell, "for", x.userref, drc);
                                            _c.label = 6;
                                        case 6:
                                            Object.keys(drc).forEach(function (d) {
                                                data = drc[d];
                                                if (data.status === 'closed'
                                                    && data.descr.ordertype !== 'settle-position') {
                                                    datad = data.descr;
                                                    since = Math.min(since, data.closetm);
                                                    // eslint-disable-next-line no-param-reassign
                                                    x.since = since;
                                                    // eslint-disable-next-line no-param-reassign
                                                    x[datad.type === 'buy' ? 'bought' : 'sold'] += Number(data.vol_exec);
                                                    if (datad.close) {
                                                        if (isNaN(x.buy) || isNaN(x.sell)) {
                                                            // eslint-disable-next-line no-param-reassign
                                                            x[datad.type] = data.price;
                                                            // eslint-disable-next-line no-param-reassign
                                                            x[datad.type === 'buy' ? 'sell' : 'buy'] =
                                                                Number(datad.close.match(/[0-9.]+/)[0]);
                                                        }
                                                    }
                                                }
                                            });
                                            f = toDec(((x.sell - x.buy) * Math.min(x.bought, x.sold)), 2);
                                            data = p.O.find(function (o) { return o.userref === x.userref; });
                                            // eslint-disable-next-line no-param-reassign
                                            x.open = (data !== undefined);
                                            if (!isNaN(f))
                                                profits += f; // Profits from just-retrieved trades.
                                            _c.label = 7;
                                        case 7:
                                            s2 = (new Date((x.since > 1 ? x.since : since) * 1000)).toLocaleString();
                                            console.log("".concat(x.userref, ": ").concat(x.buy, "-").concat(x.sell).concat((x.bought + x.sold) > 0
                                                ? (", bought ".concat(toDec(x.bought, 2), " and sold ").concat(toDec(x.sold, 2), " for ").concat(f, " since ").concat(s2))
                                                : ''));
                                            return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 2:
                        _a.sent();
                        console.log("That's ".concat(toDec(profits, 2), " altogether."));
                        return [2 /*return*/];
                }
            });
        });
    }
    // The bot's job is to make roundtrips.  This function reports them.
    // This does not address capital gains because it doesn't take into
    // account the cost basis.
    function roundTrips() { }
    function showState(prefix) {
        if (prefix === void 0) { prefix = ''; }
        var ret = "".concat(prefix + (FLAGS.risky ? 'R' : '.') + (FLAGS.safe ? 'S' : '.'), " at ").concat(new Date);
        console.log(ret);
        return ret;
    }
    // eslint-disable-next-line no-param-reassign
    config.bot = { order: order, set: set, listOpens: listOpens, deleverage: deleverage, w: w, ExchangeSavings: ExchangeSavings, refnum: refnum, list: list, kapi: kapi, lessmore: lessmore, kill: kill, report: report, howMuch: howMuch, sleep: sleep, marginReport: marginReport, getLev: getLev, showState: showState, getExtra: getExtra, pairInfo: pairInfo, showPair: showPair, FLAGS: FLAGS, save: save, basesFromPairs: basesFromPairs, findPair: findPair, numerairesFromPairs: numerairesFromPairs, init: init, keys: keys, getPrice: getPrice, tfc: tfc, getPairs: getPairs, getTickers: getTickers, getAlts: getAlts, getPortfolio: getPortfolio, getConfig: getConfig };
    return config.bot;
};
exports.Bot = Bot;
