const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3000 });

const sessions = new Map(); // hash => [clients]

wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        let data;
        try {
            data = JSON.parse(msg);
        } catch (e) {
            return;
        }
        const { type, hash } = data;
        if (!hash) return;

        if (!sessions.has(hash)) {
            sessions.set(hash, []);
        }
        const clients = sessions.get(hash);
        if (!clients.includes(ws)) {
            clients.push(ws);
        }
        sessions.set(
            hash,
            clients.filter((client) => client.readyState === WebSocket.OPEN)
        );
        if (type === 'join' && sessions.get(hash).length === 2) {
            sessions.get(hash).forEach((client) => {
                if (client !== ws) {
                    client.send(JSON.stringify({ type: 'ready' }));
                }
            });
        }
        if (['offer', 'answer', 'candidate'].includes(type)) {
            const [clientA, clientB] = sessions.get(hash);
            const other = clientA === ws ? clientB : clientA;
            if (other && other.readyState === WebSocket.OPEN) {
                other.send(JSON.stringify(data));
            }
        }
    });
    ws.on('close', () => {
        for (const [hash, clients] of sessions) {
            sessions.set(hash, clients.filter((c) => c !== ws));
        }
    });
});
console.log("Signaling server running on ws://localhost:3000");
