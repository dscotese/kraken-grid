  // Grid point structure
  export interface GridPoint {
    userref: number;
    buy: number | '?';
    sell: number | '?';
    bought: number;
    sold: number;
    since?: number;
    open?: boolean;
    aur?: number;
    [key: string]: any;
  }
  

export interface BothSidesRef {
    userref: number;
    buy: boolean;
    sell: boolean;
    trades: number;
}

// For pair-based both sides
export interface BothSidesPair {
    pair: string;
    price: number;
    buy: boolean;
    sell: boolean;
}

// Basic properties needed for capital gains calculations
export interface Order {
    descr: {
        type: 'buy' | 'sell';
        price: string;
    };
    vol_exec: string;
    closetm: number;
    price: string;
    remaining: number;  // Your custom property for tracking unclaimed volume
    cost: number;
    fee: number;
    ebi?: number;
}

// Full Kraken order with all its properties, plus your enhancement
export interface KOrder extends Order {
    // Extend descr with the additional Kraken properties
    descr: Order['descr'] & {
        order: string;
        pair: string;
        leverage: string;
        close?: string;
        ordertype: "market"|"limit"|"iceberg"|"stop-loss"|
            "take-profit"|"trailing-stop"|"stop-loss-limit"|
            "take-profit-limit"|"trailing-stop-limit"|"settle-position";
    };
    userref: number;
    vol: string;
    status: string;
    // Any other Kraken-specific properties
}

export type OrderEntry = [string, KOrder];  // [orderID, order]

export interface APIResult {
    descr?: string,
    code?: string,
    [prop: string]: any;
}
export interface APIResponse<T = APIResult> {
    error: string[],
    result: T
};

export interface TickerResponse extends APIResponse {
    result: {
        [key: string]: {
            c: Number[];  // or number[] depending on what .c contains
        }
    }
};

export interface ClosedOrderResponse extends APIResponse<{
        closed: {
            [orderId: string]: KOrder;  // Using your existing Order interface
        };
        count: number;    // This gets used in your code
    }> {};


export interface ClosedOrders {
    orders: { [orderId: string]: KOrder; };
    offset: number;
    hasFirst: boolean;
    forward: boolean;
    keysFwd: Function;
    keysBkwd: Function;
}

export interface Portfolio {
    Closed?: ClosedOrders;
    Numeraire: string;
    Allocation: AllocationInstance;
    Pairs: Set<string>;
    Tickers: Set<string>;
    G: GridPoint[];
    O: any[];
    limits: [number, number];
    secret: string;
    key: string;
    [prop: string]: any;
}

export interface GotError extends Error {
    code: string;          // For ETIMEDOUT, EAI_AGAIN etc
    message: string;        // For 'nonce', 'Internal error', etc
    response?: {
        statusCode?: number;  // For 520, 50x responses
        body?: any;
    };
}

export type KrakenOrderStatus = 
  | 'pending'   // Initial state
  | 'open'      // Active in orderbook
  | 'partially_filled' // Some amount executed
  | 'closed'    // Fully executed
  | 'canceled'  // Manually canceled
  | 'expired';  // Time limit reached

// Document the lifecycle
/**
 * Kraken Order Lifecycle:
 * 1. Order created -> status: 'pending' -> 'open'
 * 2. For each partial fill:
 *    - Order status remains 'open'
 *    - vol_exec increases
 *    - Corresponding conditional close order created
 * 3. On complete fill:
 *    - Status changes to 'closed'
 *    - Final conditional close order created
 * 
 * Bot's Current Behavior:
 * - On detecting any order without conditional close:
 *   1. Cancels existing close orders
 *   2. Creates new order for executed amount
 *   3. Adds conditional close at grid price
 */

interface GeminiOrderInfo {
    is_live: boolean;
    is_cancelled: boolean;
    executed_amount: string;
    remaining_amount: string;
    original_amount: string;
    // ... other properties
}