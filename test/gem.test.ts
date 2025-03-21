import { jest } from '@jest/globals';
import GeminiClient from '../gemini.js';
import Gclient from '../krak2gem.js';

// Mock the underlying Gemini API (Claude.ai suggestion)
jest.mock('../gemini.js');
const mockedGemini = GeminiClient as jest.MockedFunction<typeof GeminiClient>;

describe('Gemini to Kraken Translation Layer', () => {
  let gclient: any;
  let mockGem: any;
  let mockBot: any;
  
  beforeEach(() => {
    // Mock the Gemini client
    mockGem = {
      api: jest.fn(),
    };
    
    // Mock the bot interface
    mockBot = {
      getPortfolio: jest.fn().mockReturnValue({
        Numeraire: 'ZUSD',
        Pairs: new Set(['XXBTZUSD']),
        Tickers: new Set(['XXBT', 'ZUSD']),
        XXBT: [1, 30000, 1, 1],
        ZUSD: [10000, 1, 10000, 10000],
      }),
      save: jest.fn(),
      findPair: jest.fn(),
      getTickers: jest.fn().mockReturnValue(['XXBT', 'ZUSD']),
    };
    
    // Set up the mocked Gemini client
    mockedGemini.mockReturnValue(mockGem);
    
    // Create the client under test
    gclient = new Gclient('fake-key', 'fake-secret', { bot: mockBot });
    gclient.gem = mockGem;
  });
  
  describe('API Translation Tests', () => {
    test('should translate Kraken AssetPairs to Gemini symbols', async () => {
      // Mock the Gemini API response
      mockGem.api.mockResolvedValueOnce(['btcusd', 'ethusd']);
      mockGem.api.mockResolvedValueOnce({
        symbol: 'btcusd',
        base_currency: 'BTC',
        quote_currency: 'USD',
        tick_size: 0.01,
        quote_increment: 0.01,
        min_order_size: 0.00001,
        status: 'open'
      });
  
      // Call the method
      const result = await gclient.api('AssetPairs');
      
      // Verify Gemini API was called with correct parameters
      expect(mockGem.api).toHaveBeenCalledWith('symbols');
      
      // Verify the response was translated to Kraken format
      expect(result.result).toBeDefined();
      expect(result.error).toEqual([]);
    });
    
    test('should translate Kraken Balance to Gemini balances', async () => {
      // Mock the Gemini API response
      mockGem.api.mockResolvedValueOnce([
        { currency: 'BTC', amount: '1.5', available: '1.2' },
        { currency: 'USD', amount: '5000', available: '4500' }
      ]);
      
      // Call the method
      const result = await gclient.api('Balance');
      
      // Verify Gemini API was called correctly
      expect(mockGem.api).toHaveBeenCalledWith('balances');
      
      // Verify the response was translated to Kraken format
      expect(result.result).toBeDefined();
      expect(result.result.XXBT).toBeDefined();
      expect(result.result.ZUSD).toBeDefined();
    });
    
    test('should translate Kraken Ticker to Gemini ticker', async () => {
      // Mock the Gemini API response
      mockGem.api.mockResolvedValueOnce({
        bid: '29900',
        ask: '30100',
        last: '30000',
        high: '31000',
        low: '29000',
        open: '29500'
      });
      
      mockGem.api.mockResolvedValueOnce({
        bids: [{ price: '29900', amount: '0.5' }],
        asks: [{ price: '30100', amount: '0.75' }]
      });
      
      // Call the method
      const result = await gclient.api(['Ticker', { pair: 'XXBTZUSD' }]);
      
      // Verify Gemini API was called correctly
      expect(mockGem.api).toHaveBeenCalledWith('v2/ticker', { symbol: 'btcusd' });
      
      // Verify the response was translated to Kraken format
      expect(result.result.XXBTZUSD).toBeDefined();
      expect(result.result.XXBTZUSD.c).toBeDefined();
      expect(result.result.XXBTZUSD.a).toBeDefined();
      expect(result.result.XXBTZUSD.b).toBeDefined();
    });
    
    test('should translate Kraken AddOrder to Gemini order/new', async () => {
      // Mock the Gemini API response
      mockGem.api.mockResolvedValueOnce({
        order_id: '123456789',
        symbol: 'btcusd',
        price: '30000',
        avg_execution_price: '0',
        side: 'buy',
        type: 'exchange limit',
        timestamp: '1616193324',
        timestampms: 1616193324000,
        is_live: true,
        is_cancelled: false,
        is_hidden: false,
        was_forced: false,
        executed_amount: '0',
        remaining_amount: '0.1',
        original_amount: '0.1'
      });
      
      // Call the method
      const result = await gclient.api(['AddOrder', {
        pair: 'XXBTZUSD',
        userref: 12345,
        type: 'buy',
        price: '30000',
        volume: '0.1',
        leverage: 'none',
      }]);
      
      // Verify Gemini API was called correctly
      expect(mockGem.api).toHaveBeenCalledWith('order/new', expect.objectContaining({
        client_order_id: expect.any(String),
        symbol: 'btcusd',
        amount: '0.1',
        price: '30000',
        side: 'buy',
        type: 'exchange limit'
      }));
      
      // Verify the response was translated to Kraken format
      expect(result.error).toEqual([]);
      expect(result.result).toBeDefined();
    });
    
    test('should translate Kraken ClosedOrders to Gemini orders/history', async () => {
      // Mock the Gemini API response
      mockGem.api.mockResolvedValueOnce([{
        order_id: '123456789',
        symbol: 'btcusd',
        price: '30000',
        avg_execution_price: '30050',
        side: 'buy',
        type: 'exchange limit',
        timestamp: '1616193324',
        timestampms: 1616193324000,
        is_live: false,
        is_cancelled: false,
        is_hidden: false,
        was_forced: false,
        executed_amount: '0.1',
        remaining_amount: '0',
        original_amount: '0.1',
        trades: [{
          tid: 1234,
          price: '30050',
          amount: '0.1',
          fee: '0.03',
          fee_currency: 'USD',
          timestamp: 1616193324
        }]
      }]);
      
      // Call the method
      const result = await gclient.api(['ClosedOrders', { ofs: 0 }]);
      
      // Verify Gemini API was called correctly
      expect(mockGem.api).toHaveBeenCalledWith('orders/history', expect.objectContaining({
        timestamp: expect.any(String),
        limit_orders: 500,
        include_trades: true
      }));
      
      // Verify the response was translated to Kraken format
      expect(result.result.closed).toBeDefined();
      expect(result.result.count).toBeDefined();
    });
  });
  
  describe('Utility Function Tests', () => {
    test('inKraken should translate Kraken symbols to Gemini symbols', () => {
      expect(Gclient.inKraken('XXBT')).toBe('BTC');
      expect(Gclient.inKraken('ZUSD')).toBe('USD');
      expect(Gclient.inKraken('XXBTZUSD')).toBe('btcusd');
    });
    
    test('inKraken with invert flag should translate Gemini symbols to Kraken symbols', () => {
      expect(Gclient.inKraken('BTC', true)).toBe('XXBT');
      expect(Gclient.inKraken('USD', true)).toBe('ZUSD');
      expect(Gclient.inKraken('btcusd', true)).toBe('XXBTZUSD');
    });
  });
});