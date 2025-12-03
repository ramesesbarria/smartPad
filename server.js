require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();

// Use port 51920 so it's consistent with DCISM later
const PORT = process.env.PORT || 51920;

// ===== In-memory storage for pads (fallback + cache) =====
const pads = new Map(); // key: code, value: pad object

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid confusing chars
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ===== Database helper functions =====

async function savePadToDb(pad) {
  if (!db) return;
  try {
    await db.execute(
      `
      INSERT INTO pads (code, title, content, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        content = VALUES(content),
        created_at = VALUES(created_at),
        expires_at = VALUES(expires_at)
      `,
      [
        pad.code,
        pad.title,
        pad.content,
        new Date(pad.createdAt),
        new Date(pad.expiresAt)
      ]
    );
  } catch (err) {
    console.error('[DB] Error saving pad:', err.message);
  }
}

async function getPadFromDb(code) {
  if (!db) return null;
  try {
    const [rows] = await db.execute(
      'SELECT code, title, content, created_at, expires_at FROM pads WHERE code = ? LIMIT 1',
      [code]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      code: row.code,
      title: row.title,
      content: row.content,
      createdAt: row.created_at instanceof Date ? row.created_at.getTime() : Date.now(),
      expiresAt: row.expires_at instanceof Date ? row.expires_at.getTime() : Date.now()
    };
  } catch (err) {
    console.error('[DB] Error fetching pad:', err.message);
    return null;
  }
}

async function cleanupExpiredPadsInDb() {
  if (!db) return;
  try {
    await db.execute('DELETE FROM pads WHERE expires_at <= NOW()');
  } catch (err) {
    console.error('[DB] Error cleaning up expired pads:', err.message);
  }
}

// Cleanup expired pads every 5 minutes (in-memory + DB)
setInterval(() => {
  const now = Date.now();
  for (const [code, pad] of pads.entries()) {
    if (pad.expiresAt && pad.expiresAt <= now) {
      pads.delete(code);
    }
  }
  cleanupExpiredPadsInDb();
}, 5 * 60 * 1000);

// ===== Middleware =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files (CSS, client-side JS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===== Routes =====

// Home – shows Quick Save form
app.get('/', (req, res) => {
  res.render('index', { title: 'SmartPad', padCode: null });
});

// Handle Quick Save form submission
app.post('/quick-save', (req, res) => {
  const { title, content, ttlMinutes } = req.body;

  if (!content || content.trim() === '') {
    // You can improve validation later
    return res.status(400).send('Content is required');
  }

  const ttl = parseInt(ttlMinutes, 10);
  const now = Date.now();

  // Default: 60 minutes if TTL is invalid
  const expiresAt = isNaN(ttl) || ttl <= 0
    ? now + 60 * 60 * 1000
    : now + ttl * 60 * 1000;

  // Generate unique code
  let code = generateCode(6);
  while (pads.has(code)) {
    code = generateCode(6);
  }

  const pad = {
    code,
    title: title || 'Untitled',
    content,
    createdAt: now,
    expiresAt
  };

  // Store in memory
  pads.set(code, pad);

  // Fire-and-forget: also save to DB (if configured)
  savePadToDb(pad);

  // Redirect to view page for this pad
  res.redirect(`/pad/${code}`);
});

// Open existing pad by code (from home page form)
app.post('/open', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) {
    return res.redirect('/'); // later we can show a message
  }

  const normalized = code.trim().toUpperCase();
  res.redirect(`/pad/${encodeURIComponent(normalized)}`);
});

// View pad by code
app.get('/pad/:code', async (req, res) => {
  const { code } = req.params;
  const now = Date.now();

  // 1) Try in-memory cache first
  let pad = pads.get(code);
  if (pad && pad.expiresAt && pad.expiresAt <= now) {
    pads.delete(code);
    pad = null;
  }

  // 2) If not in memory, try DB
  if (!pad) {
    const dbPad = await getPadFromDb(code);
    if (!dbPad) {
      return res.status(404).render('pad-not-found', { title: 'Pad not found', code });
    }
    if (dbPad.expiresAt && dbPad.expiresAt <= now) {
      return res.status(410).render('pad-expired', { title: 'Pad expired', code });
    }

    pad = dbPad;
    // Cache it in memory for faster subsequent access
    pads.set(code, pad);
  }

  res.render('pad', { title: pad.title, pad });
});

// Simple health-check route (optional)
app.get('/health', async (req, res) => {
  let dbOk = false;
  try {
    await db.execute('SELECT 1');
    dbOk = true;
  } catch {
    dbOk = false;
  }

  res.json({
    ok: true,
    padsInMemory: pads.size,
    dbOk,
    timestamp: Date.now()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`SmartPad server running at http://localhost:${PORT}`);
});
