/**
 * server.js
 * URL shortener with click tracking + statistics endpoint.
 *
 * Usage:
 *  npm install express sqlite3
 *  npm start
 *
 * The server writes logs to ./logs and DB to ./data/app.db
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// ---------- Config ----------
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'http://localhost:3000';

// ---------- Ensure folders ----------
const dataDir = path.join(__dirname, 'data');
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

// ---------- DB ----------
const db = new sqlite3.Database(path.join(dataDir, 'app.db'), (err) => {
  if (err) {
    fs.appendFileSync(path.join(logDir, 'errors.log'), `${new Date().toISOString()} DB open error: ${err}\n`);
    process.exit(1);
  }
});

// Create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shortcode TEXT NOT NULL UNIQUE,
      originalUrl TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shortcode TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      referrer TEXT,
      ip TEXT,
      user_agent TEXT,
      country TEXT,
      FOREIGN KEY(shortcode) REFERENCES urls(shortcode) ON DELETE CASCADE
    );
  `);
});

// Promisified helper wrappers for sqlite3
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err); else resolve(this);
  }));
}

// ---------- Utilities ----------
function isValidUrl(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}
function isValidShortcode(s) {
  return /^[A-Za-z0-9]{4,20}$/.test(s);
}
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function randomCode(len = 7) {
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
function ipFromReq(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'Unknown';
}
function referrerFromReq(req) {
  return req.get('referer') || req.get('referrer') || '';
}
function countryFromReq(req) {
  const headerCountry = req.get('cf-ipcountry') || req.get('x-country') || '';
  if (headerCountry) return headerCountry;
  const al = req.get('accept-language') || '';
  const m = al.match(/[A-Za-z]{2}-([A-Za-z]{2})/);
  return m ? m[1].toUpperCase() : 'Unknown';
}

// ---------- Custom logging middleware (writes to logs/access.log) ----------
const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
function loggingMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const line = [
      new Date().toISOString(),
      ipFromReq(req),
      req.method,
      req.originalUrl,
      res.statusCode,
      duration + 'ms'
    ].join(' ') + '\n';
    accessLogStream.write(line);
  });
  next();
}

// ---------- App setup ----------
const app = express();
app.use(express.json({ limit: '200kb' }));
// Simple CORS allow for your frontend (adjust as needed)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(loggingMiddleware);

// ---------- Health ----------
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ---------- Create short URL ----------
app.post('/shorturls', async (req, res) => {
  try {
    const { url, validity, shortcode } = req.body || {};
    if (!url || !isValidUrl(url)) return res.status(400).json({ error: 'Invalid "url". Must be http/https.' });

    let minutes = 30;
    if (validity !== undefined) {
      const n = Number(validity);
      if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: '"validity" must be a positive integer (minutes).' });
      minutes = n;
    }

    let code = '';
    if (shortcode !== undefined && String(shortcode).length > 0) {
      if (!isValidShortcode(shortcode)) return res.status(400).json({ error: 'Invalid "shortcode". Use 4-20 alphanumeric characters.' });
      // Check uniqueness
      const exists = await dbGet('SELECT 1 FROM urls WHERE shortcode = ?', [shortcode]);
      if (exists) return res.status(409).json({ error: 'Shortcode already in use.' });
      code = shortcode;
    } else {
      // generate unique
      for (let i = 0; i < 6; i++) {
        const candidate = randomCode(7);
        const exists = await dbGet('SELECT 1 FROM urls WHERE shortcode = ?', [candidate]);
        if (!exists) { code = candidate; break; }
      }
      if (!code) return res.status(500).json({ error: 'Failed to generate unique shortcode. Try again.' });
    }

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

    await dbRun('INSERT INTO urls (shortcode, originalUrl, created_at, expires_at) VALUES (?,?,?,?)',
      [code, url, createdAt, expiresAt]);

    return res.status(201).json({ shortLink: `${BASE_URL}/${code}`, expiry: expiresAt });
  } catch (e) {
    fs.appendFileSync(path.join(logDir, 'errors.log'), `${new Date().toISOString()} POST /shorturls error: ${e.stack || e}\n`);
    if (String(e).includes('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'Shortcode already in use.' });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- Statistics endpoint ----------
app.get('/shorturls/:code', async (req, res) => {
  try {
    const code = req.params.code;
    if (!isValidShortcode(code)) return res.status(400).json({ error: 'Invalid shortcode format.' });

    const row = await dbGet('SELECT shortcode, originalUrl, created_at, expires_at FROM urls WHERE shortcode = ?', [code]);
    if (!row) return res.status(404).json({ error: 'Shortcode not found.' });

    const total = await dbGet('SELECT COUNT(*) as c FROM clicks WHERE shortcode = ?', [code]);
    const clicks = await dbAll('SELECT timestamp, referrer, ip, user_agent, country FROM clicks WHERE shortcode = ? ORDER BY id DESC LIMIT 200', [code]);

    return res.json({
      shortcode: row.shortcode,
      url: row.originalUrl,
      createdAt: row.created_at,
      expiry: row.expires_at,
      totalClicks: total?.c || 0,
      clicks
    });
  } catch (e) {
    fs.appendFileSync(path.join(logDir, 'errors.log'), `${new Date().toISOString()} GET /shorturls/:code error: ${e.stack || e}\n`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- Redirect (records click) ----------
app.get('/:code', async (req, res) => {
  try {
    const code = req.params.code;
    if (!isValidShortcode(code)) return res.status(404).json({ error: 'Not found' });

    const row = await dbGet('SELECT originalUrl, expires_at FROM urls WHERE shortcode = ?', [code]);
    if (!row) return res.status(404).json({ error: 'Shortcode not found.' });

    const nowIso = new Date().toISOString();
    if (nowIso > row.expires_at) return res.status(410).json({ error: 'Link expired.' });

    // Record click (best-effort, don't block the redirect)
    const click = {
      shortcode: code,
      timestamp: new Date().toISOString(),
      referrer: referrerFromReq(req),
      ip: ipFromReq(req),
      user_agent: req.get('user-agent') || '',
      country: countryFromReq(req)
    };
    dbRun('INSERT INTO clicks (shortcode, timestamp, referrer, ip, user_agent, country) VALUES (?,?,?,?,?,?)',
      [click.shortcode, click.timestamp, click.referrer, click.ip, click.user_agent, click.country])
      .catch(err => fs.appendFileSync(path.join(logDir, 'errors.log'), `${new Date().toISOString()} Click insert error: ${err}\n`));

    // Redirect user
    return res.redirect(row.originalUrl);
  } catch (e) {
    fs.appendFileSync(path.join(logDir, 'errors.log'), `${new Date().toISOString()} Redirect error: ${e.stack || e}\n`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- Fallback 404 ----------
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ---------- Start server (no console.log, write to service.log) ----------
fs.appendFileSync(path.join(logDir, 'service.log'), `${new Date().toISOString()} service starting at ${BASE_URL}\n`);
app.listen(PORT, () => {
  fs.appendFileSync(path.join(logDir, 'service.log'), `${new Date().toISOString()} service started on ${BASE_URL}\n`);
});
