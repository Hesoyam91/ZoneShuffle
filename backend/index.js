const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const { initDB, getDB } = require('./db');
const radio = require('./radio');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Uploads directory ──────────────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin: function (origin, callback) {
      const allowed = (process.env.FRONTEND_URL || 'http://localhost:5173')
        .split(',')
        .map((u) => u.trim());
      if (!origin || allowed.includes(origin)) return callback(null, true);
      callback(new Error('CORS: origin not allowed'));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// Serve audio files with byte-range support (required for seek)
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Accept-Ranges', 'bytes');
    next();
  },
  express.static(UPLOADS_DIR)
);

// ── Auth middleware ────────────────────────────────────────────────────────
const verifyDJ = (req, res, next) => {
  const token = req.cookies.dj_token;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.dj = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// ── Rate limiters ──────────────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 100 });

// ── Multer (audio upload) ─────────────────────────────────────────────────
const audioUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150 MB
  fileFilter: (_req, file, cb) => {
    const isZip = file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || path.extname(file.originalname).toLowerCase() === '.zip';
    if (file.mimetype.startsWith('audio/') || ['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a'].includes(path.extname(file.originalname).toLowerCase()) || isZip) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de audio (MP3, FLAC, WAV, OGG, AAC) y ZIP'));
    }
  },
});

// ══════════════════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════════════════

// ── Auth ───────────────────────────────────────────────────────────────────

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (
    username !== process.env.DJ_USERNAME ||
    password !== process.env.DJ_PASSWORD
  ) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const token = jwt.sign(
    { username, role: 'dj' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('dj_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ success: true });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('dj_token');
  res.json({ success: true });
});

app.get('/api/auth/verify', verifyDJ, (req, res) => {
  res.json({ authorized: true, username: req.dj.username });
});

// ── Public Radio ───────────────────────────────────────────────────────────

// Current radio status (track info + sync position)
app.get('/api/radio/status', (_req, res) => {
  res.json(radio.getStatus());
});

// SSE – real-time push for track changes
app.get('/api/radio/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({ event: 'status', ...radio.getStatus() })}\n\n`);

  // Keep connection alive
  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); }
  }, 25_000);

  radio.addSSEClient(res);
  req.on('close', () => clearInterval(keepAlive));
});

// Listener heartbeat (tracks active listener count)
app.post('/api/radio/heartbeat', (req, res) => {
  let sessionId = req.cookies.listener_session;
  if (!sessionId) {
    sessionId = uuidv4();
    res.cookie('listener_session', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }
  const db = getDB();
  const now = Date.now();
  db.prepare('INSERT OR REPLACE INTO listener_heartbeats (session_id, last_seen) VALUES (?, ?)').run(sessionId, now);
  // Prune stale entries
  db.prepare('DELETE FROM listener_heartbeats WHERE last_seen < ?').run(now - 120_000);
  res.json({ ok: true });
});

// Public stats
app.get('/api/stats', (_req, res) => {
  const db = getDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalTracks = db.prepare('SELECT COUNT(*) as c FROM tracks WHERE active = 1').get().c;
  const tracksPlayedToday = db.prepare('SELECT COUNT(*) as c FROM play_history WHERE played_at > ?').get(today.getTime()).c;
  const topTrack = db.prepare('SELECT title, artist, plays FROM tracks WHERE active = 1 ORDER BY plays DESC LIMIT 1').get();
  const listeners = radio.getListenerCount();

  res.json({ totalTracks, tracksPlayedToday, topTrack, listeners });
});

// Recent play history (public)
app.get('/api/history', (_req, res) => {
  const db = getDB();
  const history = db.prepare(`
    SELECT ph.played_at, t.title, t.artist, t.album
    FROM play_history ph
    JOIN tracks t ON ph.track_id = t.id
    ORDER BY ph.played_at DESC
    LIMIT 15
  `).all();
  res.json({ history });
});

// ── DJ Panel (protected) ───────────────────────────────────────────────────

app.get('/api/dj/playlist', verifyDJ, (_req, res) => {
  const tracks = getDB()
    .prepare('SELECT * FROM tracks ORDER BY position ASC, id ASC')
    .all();
  res.json({ tracks });
});

app.post('/api/dj/upload', verifyDJ, uploadLimiter, audioUpload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

  const filePath = path.join(UPLOADS_DIR, req.file.filename);
  const ext = path.extname(req.file.originalname).toLowerCase();

  try {
    const db = getDB();
    const mm = require('music-metadata');
    
    // helper to process a single audio file
    const processAudioFile = async (fPath, origName, defaultTitle, defaultArtist, defaultAlbum) => {
      let metadata = { common: {}, format: {} };
      try {
        metadata = await mm.parseFile(fPath);
      } catch (metaErr) {
        console.warn('[Upload] Could not parse metadata for', fPath, metaErr.message);
      }
      
      const title = defaultTitle || metadata.common.title || path.basename(origName, path.extname(origName));
      const artist = defaultArtist || metadata.common.artist || 'Unknown';
      const album = defaultAlbum || metadata.common.album || '';
      const durationMs = Math.floor((metadata.format.duration || 0) * 1000);
      
      const finalFilename = path.basename(fPath);
      if (path.dirname(fPath) !== UPLOADS_DIR) {
         fs.renameSync(fPath, path.join(UPLOADS_DIR, finalFilename));
      }
      
      const maxPos = db.prepare('SELECT MAX(position) as m FROM tracks').get().m || 0;
      db.prepare(`
        INSERT INTO tracks (title, artist, album, filename, duration_ms, position)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(title, artist, album, finalFilename, durationMs, maxPos + 1);
      
      return { title, artist, album, durationMs };
    };

    if (ext === '.zip') {
      const { execSync } = require('child_process');
      const tempDir = path.join(UPLOADS_DIR, 'temp_' + uuidv4());
      fs.mkdirSync(tempDir);
      
      try {
         execSync(`unzip -o "${filePath}" -d "${tempDir}"`);
      } catch (e) {
         console.warn('[Upload] Unzip ended with issues (could be ignored):', e.message);
      }
      
      const processDir = async (dir) => {
         const entries = fs.readdirSync(dir, { withFileTypes: true });
         for (let entry of entries) {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
               await processDir(entryPath);
            } else {
               const lowerExt = path.extname(entry.name).toLowerCase();
               if (['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a'].includes(lowerExt)) {
                  // We need to avoid name collisions but also not extract macos junk
                  if (!entry.name.startsWith('._') && !entryPath.includes('__MACOSX')) {
                    const uniqueName = `${uuidv4()}${lowerExt}`;
                    const uniquePath = path.join(tempDir, uniqueName);
                    fs.renameSync(entryPath, uniquePath);
                    await processAudioFile(uniquePath, entry.name, '', '', '');
                  }
               }
            }
         }
      };
      
      await processDir(tempDir);
      
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.unlinkSync(filePath);
      
      radio.restart();
      res.json({ success: true, message: 'ZIP procesado exitosamente', title: 'Archivo ZIP', durationMs: 0 });
    } else {
      // Single file
      const result = await processAudioFile(
         filePath, 
         req.file.originalname, 
         req.body.title?.trim(), 
         req.body.artist?.trim(), 
         req.body.album?.trim()
      );
      
      radio.restart();
      res.json({ success: true, ...result });
    }
  } catch (err) {
    try { fs.unlinkSync(filePath); } catch (_) {}
    console.error('[Upload] Error:', err);
    res.status(500).json({ error: 'Error al procesar el archivo: ' + err.message });
  }
});

app.patch('/api/dj/tracks/:id', verifyDJ, (req, res) => {
  const { title, artist, album } = req.body || {};
  const db = getDB();
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  if (!track) return res.status(404).json({ error: 'Track no encontrado' });

  db.prepare('UPDATE tracks SET title = ?, artist = ?, album = ? WHERE id = ?').run(
    title || track.title,
    artist || track.artist,
    album !== undefined ? album : track.album,
    track.id
  );
  res.json({ success: true });
});

app.delete('/api/dj/tracks/:id', verifyDJ, (req, res) => {
  const db = getDB();
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  if (!track) return res.status(404).json({ error: 'Track no encontrado' });

  try { fs.unlinkSync(path.join(UPLOADS_DIR, track.filename)); } catch (_) {}
  db.prepare('DELETE FROM tracks WHERE id = ?').run(track.id);

  radio.restart();
  res.json({ success: true });
});

app.patch('/api/dj/tracks/:id/toggle', verifyDJ, (req, res) => {
  const db = getDB();
  db.prepare('UPDATE tracks SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id);
  const track = db.prepare('SELECT active FROM tracks WHERE id = ?').get(req.params.id);
  radio.restart();
  res.json({ active: !!track.active });
});

app.put('/api/dj/reorder', verifyDJ, (req, res) => {
  const { order } = req.body; // array of IDs in desired order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Formato inválido' });
  const db = getDB();
  const stmt = db.prepare('UPDATE tracks SET position = ? WHERE id = ?');
  order.forEach((id, idx) => stmt.run(idx + 1, id));
  res.json({ success: true });
});

app.post('/api/dj/skip', verifyDJ, (_req, res) => {
  radio.skip();
  res.json({ success: true });
});

// DJ stats
app.get('/api/dj/stats', verifyDJ, (_req, res) => {
  const db = getDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalTracks = db.prepare('SELECT COUNT(*) as c FROM tracks').get().c;
  const activeTracks = db.prepare('SELECT COUNT(*) as c FROM tracks WHERE active = 1').get().c;
  const totalPlays = db.prepare('SELECT SUM(plays) as s FROM tracks').get().s || 0;
  const tracksToday = db.prepare('SELECT COUNT(*) as c FROM play_history WHERE played_at > ?').get(today.getTime()).c;
  const topTracks = db.prepare('SELECT id, title, artist, plays FROM tracks ORDER BY plays DESC LIMIT 5').all();

  res.json({ totalTracks, activeTracks, totalPlays, tracksToday, topTracks });
});

// ── Serve Frontend (Production Mode) ───────────────────────────────────────
const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
function start() {
  initDB();
  radio.start();

  app.listen(PORT, () => {
    console.log(`\n🎙️  Zone Shuffle backend running on http://localhost:${PORT}`);
    console.log(`📡  DJ Panel: http://localhost:5173/dj\n`);
  });
}

start();
