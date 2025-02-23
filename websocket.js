export default async function GemSock(config) {
    const { exchange } = config;
    const ret = await exchange.api('order/events');
    if (ret.error.length === 0) {
        const ws = ret.result;
        ws.on('error', console.error);
        ws.on('open', () => {
            ws.send('something');
        });
        ws.on('message', (data) => {
            console.log('received: %s', data);
        });
        return ws;
    }
    console.log(`WebSocket to Gemini failed: ${ret.error}`);
    return null;
}
//# sourceMappingURL=websocket.js.map