const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '../public')));

const waitingQueue = [];
const pairs = new Map();
const clients = new Map();

function send(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

function tryMatch() {
  while (waitingQueue.length >= 2) {
    const a = waitingQueue.shift();
    const b = waitingQueue.shift();

    if (a.readyState !== 1 || b.readyState !== 1) {
      if (a.readyState === 1) waitingQueue.unshift(a);
      if (b.readyState === 1) waitingQueue.unshift(b);
      continue;
    }

    pairs.set(a.peerId, b.peerId);
    pairs.set(b.peerId, a.peerId);
    clients.set(a.peerId, a);
    clients.set(b.peerId, b);

    // Send each user the other's profile
    send(a, { type: 'matched', role: 'offerer', peerId: b.peerId, profile: b.profile || {} });
    send(b, { type: 'matched', role: 'answerer', peerId: a.peerId, profile: a.profile || {} });

    console.log(`Matched: ${a.peerId} (${a.profile?.name}) <-> ${b.peerId} (${b.profile?.name})`);
  }
}

wss.on('connection', (ws) => {
  ws.peerId = uuidv4();
  ws.profile = {};
  clients.set(ws.peerId, ws);
  send(ws, { type: 'connected', peerId: ws.peerId });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'find': {
        if (msg.profile) ws.profile = msg.profile;
        if (!waitingQueue.includes(ws)) waitingQueue.push(ws);
        send(ws, { type: 'waiting' });
        tryMatch();
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice': {
        const partnerId = pairs.get(ws.peerId);
        const partner = clients.get(partnerId);
        if (partner) send(partner, { type: msg.type, data: msg.data });
        break;
      }

      case 'next': {
        if (msg.profile) ws.profile = msg.profile;
        const partnerId = pairs.get(ws.peerId);
        const partner = clients.get(partnerId);
        if (partner) {
          send(partner, { type: 'peer_left' });
          pairs.delete(partnerId);
          if (partner.readyState === 1) {
            waitingQueue.push(partner);
            send(partner, { type: 'waiting' });
            tryMatch();
          }
        }
        pairs.delete(ws.peerId);
        waitingQueue.push(ws);
        send(ws, { type: 'waiting' });
        tryMatch();
        break;
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws.peerId);
    const idx = waitingQueue.indexOf(ws);
    if (idx !== -1) waitingQueue.splice(idx, 1);
    const partnerId = pairs.get(ws.peerId);
    const partner = clients.get(partnerId);
    if (partner) {
      send(partner, { type: 'peer_left' });
      pairs.delete(partnerId);
      if (partner.readyState === 1) {
        waitingQueue.push(partner);
        send(partner, { type: 'waiting' });
        tryMatch();
      }
    }
    pairs.delete(ws.peerId);
  });

  ws.on('error', (err) => console.error(`WS error ${ws.peerId}:`, err.message));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Slinky running on port ${PORT}`));
