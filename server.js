require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

// Use port 51920 so it's consistent with DCISM later
const PORT = process.env.PORT || 51920;

// ===== In-memory storage for pads (temporary, before DB) =====
const pads = new Map(); // key: code, value: pad object

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid confusing chars
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Cleanup expired pads every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, pad] of pads.entries()) {
    if (pad.expiresAt && pad.expiresAt <= now) {
      pads.delete(code);
    }
  }
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

  pads.set(code, {
    code,
    title: title || 'Untitled',
    content,
    createdAt: now,
    expiresAt
  });

  // Redirect to view page for this pad
  res.redirect(`/pad/${code}`);
});

// View pad by code
app.get('/pad/:code', (req, res) => {
  const { code } = req.params;
  const pad = pads.get(code);

  if (!pad) {
    return res.status(404).render('pad-not-found', { title: 'Pad not found', code });
  }

  const now = Date.now();
  if (pad.expiresAt && pad.expiresAt <= now) {
    pads.delete(code);
    return res.status(410).render('pad-expired', { title: 'Pad expired', code });
  }

  res.render('pad', { title: pad.title, pad });
});

// Simple health-check route (optional)
app.get('/health', (req, res) => {
  res.json({ ok: true, padsCount: pads.size, timestamp: Date.now() });
});

// Start server
app.listen(PORT, () => {
  console.log(`SmartPad server running at http://localhost:${PORT}`);
});
