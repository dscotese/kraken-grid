import WebSocket from 'ws';

interface Config {
  exchange: {
    api: (endpoint: string, params?: any) => Promise<{
      error: string[];
      result: any;
    }>;
  };
  [key: string]: any;
}

export default async function GemSock(config: Config): Promise<WebSocket | null> {
  const { exchange } = config;
  const ret = await exchange.api('order/events');
  
  if (ret.error.length === 0) {
    const ws = ret.result as WebSocket;
    
    ws.on('error', console.error);
    
    ws.on('open', () => {
      ws.send('something');
    });
    
    ws.on('message', (data: WebSocket.Data) => {
      console.log('received: %s', data);
    });
    
    return ws;
  }
  
  console.log(`WebSocket to Gemini failed: ${ret.error}`);
  return null;
}