// server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

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
 *   expiresAt: number (ms),
 *   passwordHash: string | null,
 *   ownerId: string | null
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
      INSERT INTO pads (code, title, content, created_at, expires_at, password_hash, owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        content = VALUES(content),
        created_at = VALUES(created_at),
        expires_at = VALUES(expires_at),
        password_hash = VALUES(password_hash),
        owner_id = VALUES(owner_id)
      `,
      [
        pad.code,
        pad.title,
        pad.content,
        new Date(pad.createdAt),
        new Date(pad.expiresAt),
        pad.passwordHash || null,
        pad.ownerId || null
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
      'SELECT code, title, content, created_at, expires_at, password_hash, owner_id FROM pads WHERE code = ? LIMIT 1',
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
        row.expires_at instanceof Date ? row.expires_at.getTime() : Date.now(),
      passwordHash: row.password_hash || null,
      ownerId: row.owner_id || null
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

// ---------- User helpers (for ID-number accounts) ----------

async function getUserByIdNumber(idNumber) {
  if (!db) return null;
  try {
    const [rows] = await db.execute(
      'SELECT id_number, password_hash FROM user_accounts WHERE id_number = ? LIMIT 1',
      [idNumber]
    );
    if (rows.length === 0) return null;
    return {
      idNumber: rows[0].id_number,
      passwordHash: rows[0].password_hash
    };
  } catch (err) {
    console.error('[DB] Error fetching user:', err.message);
    return null;
  }
}

async function createUser(idNumber, passwordHash) {
  if (!db) return;
  try {
    await db.execute(
      'INSERT INTO user_accounts (id_number, password_hash) VALUES (?, ?)',
      [idNumber, passwordHash]
    );
  } catch (err) {
    console.error('[DB] Error creating user:', err.message);
  }
}

// ---------- Express config ----------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---------- Routes ----------

// Home workspace
app.get('/', (req, res) => {
  res.render('index', { title: 'SmartPad' });
});

// Quick save pad (with optional password + TTL)
app.post('/quick-save', async (req, res) => {
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
    ? now + 60 * 60 * 1000
    : now + ttl * 60 * 1000;

  let code = generateCode(6);
  while (pads.has(code)) {
    code = generateCode(6);
  }

  let passwordHash = null;
  const plain = typeof password === 'string' ? password.trim() : '';
  if (plain) {
    try {
      passwordHash = await bcrypt.hash(plain, 10);
    } catch (err) {
      console.error('[Auth] Failed to hash pad password:', err.message);
    }
  }

  const pad = {
    code,
    title: title || 'Untitled',
    content,
    createdAt: now,
    expiresAt,
    passwordHash,
    ownerId: null
  };

  pads.set(code, pad);
  await savePadToDb(pad);

  if (wantsJson) {
    return res.json({
      ok: true,
      code: pad.code,
      title: pad.title,
      expiresAt: pad.expiresAt
    });
  }

  res.redirect(`/pad/${pad.code}`);
});

// Open pad via form fallback
app.post('/open', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) {
    return res.redirect('/');
  }
  const normalized = code.trim().toUpperCase();
  res.redirect(`/pad/${encodeURIComponent(normalized)}`);
});

// JSON API: load a pad (supports pad-level password)
app.get('/api/pad/:code', async (req, res) => {
  const { code } = req.params;
  const suppliedPassword = req.query.password;
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

  if (pad.passwordHash) {
    if (!suppliedPassword || !suppliedPassword.trim()) {
      return res
        .status(401)
        .json({ ok: false, error: 'Password required', requiresPassword: true });
    }
    try {
      const ok = await bcrypt.compare(suppliedPassword.trim(), pad.passwordHash);
      if (!ok) {
        return res
          .status(403)
          .json({ ok: false, error: 'Incorrect password', requiresPassword: true });
      }
    } catch (err) {
      console.error('[Auth] Password check failed:', err.message);
      return res
        .status(500)
        .json({ ok: false, error: 'Password check failed' });
    }
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

// Read-only pad view (for /CODE links) with password page when needed
app.get('/pad/:code', async (req, res) => {
  const { code } = req.params;
  const providedPassword = req.query.password;
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

  if (pad.passwordHash) {
    if (!providedPassword || !providedPassword.trim()) {
      return res.render('pad-password', {
        title: 'Password required',
        code,
        error: null
      });
    }
    try {
      const ok = await bcrypt.compare(providedPassword.trim(), pad.passwordHash);
      if (!ok) {
        return res.render('pad-password', {
          title: 'Password required',
          code,
          error: 'Incorrect password. Please try again.'
        });
      }
    } catch (err) {
      console.error('[Auth] Password check failed (view):', err.message);
      return res.status(500).send('Password check failed');
    }
  }

  res.render('pad', {
    title: pad.title,
    pad
  });
});

// ---------- Save to ID number: API routes ----------

// Save current note to a student's ID
app.post('/api/save-to-id', async (req, res) => {
  const { idNumber, password, title, content } = req.body;

  if (!db) {
    return res
      .status(500)
      .json({ ok: false, error: 'Database is not configured on server' });
  }

  if (!content || !content.trim()) {
    return res
      .status(400)
      .json({ ok: false, error: 'Content is required' });
  }

  if (!idNumber || !idNumber.trim() || !password || !password.trim()) {
    return res
      .status(400)
      .json({ ok: false, error: 'ID number and password are required' });
  }

  const trimmedId = idNumber.trim();
  const trimmedPassword = password.trim();

  try {
    let user = await getUserByIdNumber(trimmedId);

    if (!user) {
      const hash = await bcrypt.hash(trimmedPassword, 10);
      await createUser(trimmedId, hash);
      user = { idNumber: trimmedId, passwordHash: hash };
    } else {
      const ok = await bcrypt.compare(trimmedPassword, user.passwordHash);
      if (!ok) {
        return res
          .status(403)
          .json({ ok: false, error: 'Incorrect ID number or password' });
      }
    }

    const now = Date.now();
    const expiresAt = now + 10 * 365 * 24 * 60 * 60 * 1000; // ~10 years

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
      passwordHash: null, // account-level auth, not per-pad
      ownerId: trimmedId
    };

    pads.set(code, pad);
    await savePadToDb(pad);

    return res.json({
      ok: true,
      code: pad.code,
      ownerId: pad.ownerId,
      title: pad.title,
      createdAt: pad.createdAt
    });
  } catch (err) {
    console.error('[ID Save] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'Failed to save pad' });
  }
});

// List all pads for a student's ID
app.post('/api/list-id-pads', async (req, res) => {
  const { idNumber, password } = req.body;

  if (!db) {
    return res
      .status(500)
      .json({ ok: false, error: 'Database is not configured on server' });
  }

  if (!idNumber || !idNumber.trim() || !password || !password.trim()) {
    return res
      .status(400)
      .json({ ok: false, error: 'ID number and password are required' });
  }

  const trimmedId = idNumber.trim();
  const trimmedPassword = password.trim();
  const now = Date.now();

  try {
    const user = await getUserByIdNumber(trimmedId);
    if (!user) {
      return res
        .status(401)
        .json({ ok: false, error: 'No account found for that ID' });
    }

    const ok = await bcrypt.compare(trimmedPassword, user.passwordHash);
    if (!ok) {
      return res
        .status(403)
        .json({ ok: false, error: 'Incorrect ID number or password' });
    }

    const [rows] = await db.execute(
      `
      SELECT code, title, content, created_at, expires_at
      FROM pads
      WHERE owner_id = ?
      ORDER BY created_at DESC
      LIMIT 100
      `,
      [trimmedId]
    );

    const padsList = rows
      .map((row) => ({
        code: row.code,
        title: row.title,
        content: row.content,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.getTime()
            : now,
        expiresAt:
          row.expires_at instanceof Date
            ? row.expires_at.getTime()
            : now,
        ownerId: trimmedId
      }))
      .filter((pad) => !pad.expiresAt || pad.expiresAt > now);

    return res.json({ ok: true, pads: padsList });
  } catch (err) {
    console.error('[ID List] Error:', err.message);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to load pads' });
  }
});

// ---------- Misc ----------

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

// Direct /CODE -> /pad/CODE
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
