const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '../public')));

// Waiting queue and active pairs
const waitingQueue = [];
const pairs = new Map(); // peerId -> peerId

function send(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function tryMatch() {
  while (waitingQueue.length >= 2) {
    const a = waitingQueue.shift();
    const b = waitingQueue.shift();

    if (a.readyState !== 1 || b.readyState !== 1) {
      // One disconnected while waiting, re-queue the live one
      if (a.readyState === 1) waitingQueue.unshift(a);
      if (b.readyState === 1) waitingQueue.unshift(b);
      continue;
    }

    // Pair them
    pairs.set(a.peerId, b.peerId);
    pairs.set(b.peerId, a.peerId);
    clients.set(a.peerId, a);
    clients.set(b.peerId, b);

    // A is the offerer
    send(a, { type: 'matched', role: 'offerer', peerId: b.peerId });
    send(b, { type: 'matched', role: 'answerer', peerId: a.peerId });

    console.log(`Matched: ${a.peerId} <-> ${b.peerId}`);
  }
}

// peerId -> ws
const clients = new Map();

wss.on('connection', (ws) => {
  ws.peerId = uuidv4();
  clients.set(ws.peerId, ws);

  send(ws, { type: 'connected', peerId: ws.peerId });
  console.log(`Connected: ${ws.peerId} | Online: ${clients.size}`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'find': {
        // Add to waiting queue
        if (!waitingQueue.includes(ws)) {
          waitingQueue.push(ws);
        }
        send(ws, { type: 'waiting' });
        tryMatch();
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice': {
        // Relay WebRTC signals to peer
        const partnerId = pairs.get(ws.peerId);
        const partner = clients.get(partnerId);
        if (partner) {
          send(partner, { type: msg.type, data: msg.data });
        }
        break;
      }

      case 'next': {
        // Disconnect from current partner, go back to queue
        const partnerId = pairs.get(ws.peerId);
        const partner = clients.get(partnerId);

        if (partner) {
          send(partner, { type: 'peer_left' });
          pairs.delete(partnerId);
          // Put partner back in queue
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
    console.log(`Disconnected: ${ws.peerId}`);
    clients.delete(ws.peerId);

    // Remove from queue
    const idx = waitingQueue.indexOf(ws);
    if (idx !== -1) waitingQueue.splice(idx, 1);

    // Notify partner
    const partnerId = pairs.get(ws.peerId);
    const partner = clients.get(partnerId);
    if (partner) {
      send(partner, { type: 'peer_left' });
      pairs.delete(partnerId);
      // Re-queue partner
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
server.listen(PORT, () => {
  console.log(`Slinky running on port ${PORT}`);
});
