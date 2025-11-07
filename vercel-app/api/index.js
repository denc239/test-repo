/*
 * Discord-like signalling server for Vercel using Express.
 *
 * This server exposes the following routes:
 *   POST /api/join  - join a room
 *   POST /api/send  - send a message to a peer
 *   POST /api/leave - leave a room
 *   GET  /api/poll  - long‑poll for pending messages
 *
 * The server maintains in‑memory "rooms" and "messageQueues" objects to track
 * connected peers and queued messages. These variables persist for the
 * lifetime of the serverless function's container, but may reset when the
 * function is cold‑started. This implementation is for demonstration and
 * should be replaced with a persistent store in a production environment.
 */

const express = require('express');
const app = express();

app.use(express.json());

// In‑memory data structures
const rooms = {};
const messageQueues = {};

// Utility: ensure message queue exists
function ensureQueue(peerId) {
  if (!messageQueues[peerId]) {
    messageQueues[peerId] = [];
  }
}

// POST /api/join
app.post('/join', (req, res) => {
  const { roomId, peerId } = req.body;
  if (!roomId || !peerId) {
    res.status(400).json({ error: 'Missing roomId or peerId' });
    return;
  }
  if (!rooms[roomId]) {
    rooms[roomId] = [];
  }
  // Collect existing peers excluding the new one
  const existingPeers = rooms[roomId].filter((p) => p !== peerId);
  rooms[roomId].push(peerId);
  ensureQueue(peerId);
  // Notify existing peers about new peer
  existingPeers.forEach((other) => {
    ensureQueue(other);
    messageQueues[other].push({ type: 'peer-connected', from: peerId });
  });
  res.json({ existingPeers });
});

// POST /api/send
app.post('/send', (req, res) => {
  const { to, type, data, from } = req.body;
  if (!to || !type || from == null) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }
  ensureQueue(to);
  messageQueues[to].push({ type, data, from });
  res.json({ status: 'ok' });
});

// POST /api/leave
app.post('/leave', (req, res) => {
  const { roomId, peerId } = req.body;
  if (!roomId || !peerId) {
    res.status(400).json({ error: 'Missing roomId or peerId' });
    return;
  }
  if (rooms[roomId]) {
    rooms[roomId] = rooms[roomId].filter((p) => p !== peerId);
    rooms[roomId].forEach((other) => {
      ensureQueue(other);
      messageQueues[other].push({ type: 'peer-disconnected', from: peerId });
    });
    if (rooms[roomId].length === 0) {
      delete rooms[roomId];
    }
  }
  delete messageQueues[peerId];
  res.json({ status: 'left' });
});

// GET /api/poll
app.get('/poll', (req, res) => {
  const peerId = req.query.peerId;
  if (!peerId) {
    res.status(400).json({ error: 'Missing peerId' });
    return;
  }
  ensureQueue(peerId);
  const messages = messageQueues[peerId];
  // Clear queue
  messageQueues[peerId] = [];
  res.json({ messages });
});

// Export the Express app. Vercel will handle the rest.
module.exports = app;
