// server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 51920;

// ---------- In-memory pad store ----------

/**
 * Pad shape:
 * {
 *   code: string,
 *   title: string,
 *   content: string,
 *   createdAt: number (ms),
 *   expiresAt: number (ms)
 * }
 */
const pads = new Map();

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// ---------- Database setup ----------

let db = null;

async function initDb() {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || 3306;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASS;
  const database = process.env.DB_NAME;

  if (!user || !password || !database) {
    console.warn('[DB] Missing DB_USER / DB_PASS / DB_NAME in .env, DB features disabled.');
    return;
  }

  try {
    db = await mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      connectionLimit: 5
    });
    console.log('[DB] Connection pool created.');
  } catch (err) {
    console.error('[DB] Failed to create pool:', err.message);
    db = null;
  }
}

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
      createdAt:
        row.created_at instanceof Date ? row.created_at.getTime() : Date.now(),
      expiresAt:
        row.expires_at instanceof Date ? row.expires_at.getTime() : Date.now()
    };
  } catch (err) {
    console.error('[DB] Error fetching pad:', err.message);
    return null;
  }
}

async function checkDbHealth() {
  if (!db) return false;
  try {
    const [rows] = await db.query('SELECT 1 AS ok');
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.error('[DB] Health check failed:', err.message);
    return false;
  }
}

// ---------- Express config ----------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---------- Routes ----------

// Home workspace (session notes UI)
app.get('/', (req, res) => {
  res.render('index', { title: 'SmartPad' });
});

// Quick save pad (supports both form and AJAX/JSON)
app.post('/quick-save', (req, res) => {
  const { title, content, ttlMinutes, password } = req.body;

  const wantsJson =
    req.get('X-Requested-With') === 'XMLHttpRequest' ||
    (req.accepts('json') && !req.accepts('html'));

  if (!content || content.trim() === '') {
    if (wantsJson) {
      return res.status(400).json({ ok: false, error: 'Content is required' });
    }
    return res.status(400).send('Content is required');
  }

  const ttl = parseInt(ttlMinutes, 10);
  const now = Date.now();

  const expiresAt = Number.isNaN(ttl) || ttl <= 0
    ? now + 60 * 60 * 1000 // default 1h
    : now + ttl * 60 * 1000;

  let code = generateCode(6);
  while (pads.has(code)) {
    code = generateCode(6);
  }

    const pad = {
    code,
    title: title || 'Untitled',
    content,
    createdAt: now,
    expiresAt,
    password: password || null // currently not enforced on read; we'll wire that later
  };


  pads.set(code, pad);
  savePadToDb(pad);

  if (wantsJson) {
    return res.json({
      ok: true,
      code: pad.code,
      title: pad.title,
      expiresAt: pad.expiresAt
    });
  }

  // Fallback if some client still posts a normal form
  res.redirect(`/pad/${pad.code}`);
});

// Open pad from a code submitted via form (used earlier; kept for compatibility)
app.post('/open', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) {
    return res.redirect('/');
  }
  const normalized = code.trim().toUpperCase();
  res.redirect(`/pad/${encodeURIComponent(normalized)}`);
});

// JSON API to load a pad into the workspace
app.get('/api/pad/:code', async (req, res) => {
  const { code } = req.params;
  const now = Date.now();

  let pad = pads.get(code);
  if (pad && pad.expiresAt && pad.expiresAt <= now) {
    pads.delete(code);
    pad = null;
  }

  if (!pad) {
    const dbPad = await getPadFromDb(code);
    if (!dbPad) {
      return res.status(404).json({ ok: false, error: 'Pad not found' });
    }
    if (dbPad.expiresAt && dbPad.expiresAt <= now) {
      return res.status(410).json({ ok: false, error: 'Pad expired' });
    }
    pad = dbPad;
    pads.set(code, pad);
  }

  res.json({
    ok: true,
    pad: {
      code: pad.code,
      title: pad.title,
      content: pad.content,
      createdAt: pad.createdAt,
      expiresAt: pad.expiresAt
    }
  });
});

// Read-only pad view (for sharable URLs)
app.get('/pad/:code', async (req, res) => {
  const { code } = req.params;
  const now = Date.now();

  let pad = pads.get(code);
  if (pad && pad.expiresAt && pad.expiresAt <= now) {
    pads.delete(code);
    pad = null;
  }

  if (!pad) {
    const dbPad = await getPadFromDb(code);
    if (!dbPad) {
      return res
        .status(404)
        .render('pad-not-found', { title: 'Pad not found', code });
    }
    if (dbPad.expiresAt && dbPad.expiresAt <= now) {
      return res
        .status(410)
        .render('pad-expired', { title: 'Pad expired', code });
    }
    pad = dbPad;
    pads.set(code, pad);
  }

  res.render('pad', {
    title: pad.title,
    pad
  });
});

// Health check
app.get('/health', async (req, res) => {
  const dbOk = await checkDbHealth();
  res.json({
    ok: true,
    padsInMemory: pads.size,
    dbOk,
    timestamp: Date.now()
  });
});

// Allow direct links like /ABC123 -> /pad/ABC123
app.get('/:code', (req, res, next) => {
  const { code } = req.params;
  const reserved = new Set(['health', 'pad', 'api', 'quick-save', 'open']);
  if (reserved.has(code)) return next();
  res.redirect(`/pad/${encodeURIComponent(code)}`);
});

// ---------- Start server ----------

initDb().finally(() => {
  app.listen(PORT, () => {
    console.log(`SmartPad server running at http://localhost:${PORT}`);
  });
});
