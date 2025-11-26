// server.js
// Express + WS + SQLite for sermon CRUD and real-time control

const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');

// ===============================
// 🔧 Ajuste para RENDER (Disk)
// ===============================
const DATA_DIR = "/var/data";
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'sermons.db');
const dbExists = fs.existsSync(DB_FILE);
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  if (!dbExists) {
    db.run(`
      CREATE TABLE sermons (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT,
        slides TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT
      )
    `);
    console.log('Database created and table sermons initialized.');
  } else {
    console.log('Database opened:', DB_FILE);
  }
});

const app = express();
const server = http.createServer(app);

app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// =====================================================
// REST API
// =====================================================

app.get('/api/sermons', (req, res) => {
  db.all('SELECT * FROM sermons ORDER BY createdAt DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const data = rows.map(r => ({ ...r, slides: JSON.parse(r.slides) }));
    res.json(data);
  });
});

app.get('/api/sermons/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM sermons WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    row.slides = JSON.parse(row.slides);
    res.json(row);
  });
});

app.post('/api/sermons', (req, res) => {
  const { id, title, date, slides } = req.body;
  if (!title || !slides) return res.status(400).json({ error: 'title and slides required' });

  const nid = id || ('s_' + Math.random().toString(36).slice(2, 9));
  const now = new Date().toISOString();

  db.run(
    'INSERT INTO sermons(id, title, date, slides, createdAt, updatedAt) VALUES(?,?,?,?,?,?)',
    [nid, title, date || null, JSON.stringify(slides), now, now],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: nid, title, date, slides, createdAt: now, updatedAt: now });
    }
  );
});

app.put('/api/sermons/:id', (req, res) => {
  const id = req.params.id;
  const { title, date, slides } = req.body;
  if (!title || !slides) return res.status(400).json({ error: 'title and slides required' });

  const now = new Date().toISOString();

  db.run(
    'UPDATE sermons SET title = ?, date = ?, slides = ?, updatedAt = ? WHERE id = ?',
    [title, date || null, JSON.stringify(slides), now, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ id, title, date, slides, updatedAt: now });
    }
  );
});

app.delete('/api/sermons/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM sermons WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: id });
  });
});

// =====================================================
// WebSocket server
// =====================================================

const wss = new WebSocket.Server({ server });

const roomsDisplays = new Map();
const roomsPanels = new Map();

function ensure(map, room) {
  if (!map.has(room)) map.set(room, new Set());
  return map.get(room);
}

wss.on('connection', (ws) => {

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch (e) { return; }

    if (msg.type === 'hello') {
      ws.role = msg.role || 'display';
      ws.room = msg.room || 'default';

      if (ws.role === 'display') {
        ensure(roomsDisplays, ws.room).add(ws);
        console.log(`Display connected room=${ws.room} (total=${roomsDisplays.get(ws.room).size})`);
      } else {
        ensure(roomsPanels, ws.room).add(ws);
        console.log(`Panel connected room=${ws.room} (total=${roomsPanels.get(ws.room).size})`);
      }
      return;
    }

    if (msg.room) {
      const displays = roomsDisplays.get(msg.room);
      if (displays && (
        msg.type === 'load' ||
        msg.type === 'goto' ||
        msg.type === 'next' ||
        msg.type === 'prev' ||
        msg.type === 'command'
      )) {
        const payload = JSON.stringify(msg);
        for (const c of displays) {
          if (c.readyState === WebSocket.OPEN) c.send(payload);
        }
      }
    }
  });

  ws.on('close', () => {
    if (ws.room) {
      if (ws.role === 'display') {
        const s = roomsDisplays.get(ws.room);
        if (s) { s.delete(ws); if (s.size === 0) roomsDisplays.delete(ws.room); }
      } else {
        const s = roomsPanels.get(ws.room);
        if (s) { s.delete(ws); if (s.size === 0) roomsPanels.delete(ws.room); }
      }
    }
  });

});

// WebSocket heartbeat (stable on Render)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

// =====================================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
