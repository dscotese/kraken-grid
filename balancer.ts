import { AllocationInstance } from './allocation';
import { BotInstance } from './bot';

// Configuration object passed to Balancer
export interface BalancerConfig {
  bot: BotInstance;
}

// Interface for a trade decision
export interface TradeDecision {
  pair: string;
  type: 'buy' | 'sell';
  amt: number;
  price: number;
  of?: number;
  isNumer?: boolean;
}

// Interface for Balancer instance returned by the constructor
export interface BalancerInstance {
  setTrades: (move: string, tkr?: string) => Promise<void>;
}

// Type for the Balancer constructor function
export type BalancerConstructor = 
  (config: BalancerConfig) => BalancerInstance;
  
const Balancer = (config: BalancerConfig): BalancerInstance => {
    const { bot } = config;
    const target: AllocationInstance = (bot.portfolio?.Allocation 
        && bot.portfolio.Allocation.size() > 0)
        ? bot.portfolio.Allocation
        : false;  // Get desired allocation.
    const already: string[] = [];   // Pairs that are already gridded
    const { sigdig } = target || { sigdig: (x: number, sig?: number, dp?: number) => x };
    
    // The first arg can be an order to place and that
    // indicates that we want to add the opposite
    // side using the moved price.  To do that, we need to
    // calculate how much we want to trade at that new
    // price and then place the trade with a conditional
    // close at the price of the passed in pending order.
    // These are the two prices of a grid point and the
    // situation is as if only part of one side executed,
    // the order we are to place.
    // We assume that the whole crypto market will move and
    // so calculate when to sell or buy based on how the
    // move affects the allocation.
    // ----------------------------------------------------
    async function buyAndSell(p: TradeDecision, sMove: string): Promise<void> {
        const move = Number(sMove);
        if (already.includes(p.pair)) { // Sanity check.
            console.log("Already set trades for", p.pair);
            return;
        }
        if(!bot.portfolio) {
            console.log("No Portfolio. Please make an issue on Github.", p.pair);
            return;
        }
        already.push(p.pair);   // Wait till trades are set?
        const po = bot.pairInfo(p.pair);
        const port = bot.getPortfolio();
        const qisn = (po.quote === port.Numeraire); // If the quote for the pair isn't our Numeraire
        // then we will do only 1/3 of the volume and convert the prices accordingly. (see qisn)
        const qf = qisn ? 1 : port[po.quote][1];   // Factor for adjustments

        let curP = port[po.base][1];    // Current price in Numeraire.
        const sP = sigdig(curP * (1 + move) / qf, 6, po.pair_decimals);
        const bP = sigdig((curP / (1 + move)) / (qisn ? 1 : port[po.quote][1]), 6, po.pair_decimals);
        let sAmt = -1 * await bot.howMuch(po.base, sP);
        let bAmt = await bot.howMuch(po.base, bP);
        // We have the amount to sell and buy BEFORE being in balance,
        // but if we get in balance by selling or buying p.amt, that 
        // trade will be added to the buy or sell, so remove it for now.
        // -------------------------------------------------------------
        curP = p.price;
        if (p.type === 'buy') sAmt -= p.amt;
        if (p.type === 'sell') bAmt -= p.amt;
        
        bAmt = sigdig(bAmt, 6, po.lot_decimals);
        sAmt = sigdig(sAmt, 6, po.lot_decimals);
        console.log('buy', po.base, bP, bAmt, curP);
        console.log('sell', po.base, sP, sAmt, curP);
        
        if (bAmt < 0 || sAmt < 0) {
            console.log("We are too far out of balance. Try after some of the trade above is done.");
            return;
        }
        
        // Now we have the trade to balance (p) and the
        // correct amounts for the two new trades to place.
        // The traded amount from p must be added to the other 
        // side if it happens first, and if the other side
        // happens first, then its amt must be added to p.
        // bot.order() using p will return an object {txid,uref}
        // so that we can use that uref for the other side, and
        // that will add those amounts properly when bot.listOpens
        // processes the open orders.
        // -------------------------------------------------------
        // We are replacing the grid for p.pair, so let's cancel
        // all its orders.
        const toCancel = bot.portfolio.O.filter(o => [p.pair, po.altname].includes(o[1].descr.pair))
            .map(ae => ae[0]);
        console.log(`${bot.FLAGS.safe ? 'NOT ' : ''}Cancelling`, toCancel);
        
        if (!bot.FLAGS.safe && toCancel)
            await bot.kill(toCancel);
            
        const Ordered = await bot.order(p.type, p.pair, p.price, p.amt,
            bot.getLev(bot.portfolio, p.type, p.price, p.amt, po.base, false),
            0, p.type === 'buy' ? sP : bP); // uref, close
            
        if (Ordered.uref) { // Order placed, and there is the uref for the other side.
            bot.order('buy', p.pair, bP, bAmt,
                bot.getLev(bot.portfolio, 'buy', bP, bAmt, po.base, false),
                p.type === 'buy' ? 0 : Ordered.uref, p.price);
            bot.order('sell', p.pair, sP, sAmt,
                bot.getLev(bot.portfolio, 'sell', sP, sAmt, po.base, false),
                p.type === 'buy' ? Ordered.uref : 0, p.price);
        }

        if (bot.FLAGS.verbose)
            console.log({qf, curP, sAmt, bAmt, sP, bP, Ordered});
    }

    async function setTrades(move: string, tkr: string = ''): Promise<void> { 
        const c = await target.getAllocation(false); // Current alloc, and updates prices
        const total = target.getTotal();
        const p = await target.bestTrade(c, tkr, total);
        
        if (p.of) console.log("Still", p.of - p.amt, p.pair, "to go...");
        else if (p.pair && p.isNumer) await buyAndSell(p, move);
        else if (p.pair === '') console.log("20: No tradable pair could be found.");
        else console.log("21: One time trade to save fees.");
    }
    
    return { setTrades };
};

export default Balancer;