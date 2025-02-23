export interface GridPoint {
    userref: number;
    buy: string | '?';
    sell: string | '?';
    bought: number;
    sold: number;
    [key: string]: any;  // For any additional properties you might set
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

export interface Order {
    descr: {
        order: string;
        pair: string;
        type: 'buy' | 'sell';
        price: string;
        leverage: string;
        close?: string;
    };
    userref: number;
    vol: number;
    vol_exec: number;
    status: string;
    closetm: number;
    price: string;
    // ... other order properties
}

export type OrderEntry = [string, Order];  // [orderID, order]

export interface APIResponse {
    error: string[],
    result: {
        descr?: string,
        code?: string,
        [prop: string]: any;
    }
};

export interface TickerResponse {
    result: {
        [key: string]: {
            c: Number[];  // or number[] depending on what .c contains
        }
    }
};

export interface ClosedOrderResponse {
    result: {
        closed: {
            [orderId: string]: Order;  // Using your existing Order interface
        };
        count: number;    // This gets used in your code
    };
};

export interface ClosedOrders {
    orders: { [orderId: string]: Order; };
    offset: number;
    hasFirst: boolean;
    forward: boolean;
    keysFwd: Function;
    keysBkwd: Function;
}

export interface Portfolio {
    Closed?: ClosedOrders;
    Numeraire: string;
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