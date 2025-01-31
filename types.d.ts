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

export interface Portfolio {
    Closed?: { 
        orders: { [orderId: string]: Order; };
        offset: number;
        hasFirst?: boolean;
        forward?: boolean;
        keysFwd?: Function;
        keysBkwd?: Function;
    };
    Numeraire?: string;
    secret?: string;
    key?: string;
    [prop: string]: any;
}