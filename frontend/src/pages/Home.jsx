import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

// ── Helpers ────────────────────────────────────────────────────
const api = axios.create({ baseURL: '/api', withCredentials: true });

function formatTime(ms) {
  if (!ms || ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ── Terminal Typewriter Label ──────────────────────────────────
// Maps player state → message shown above the title
const LABEL_MESSAGES = {
  playing: '// transmitting signal',
  paused: '// signal suspended',
  offline: '// no signal detected',
  loading: '// searching frequency',
  empty: '// awaiting upload',
};

function TerminalLabel({ state }) {
  const target = LABEL_MESSAGES[state] || LABEL_MESSAGES.offline;
  const [displayed, setDisplayed] = useState('');
  const [typing, setTyping] = useState(true);
  const prevTarget = useRef(target);
  const timerRef = useRef(null);

  const typeOut = useCallback((text) => {
    setDisplayed('');
    setTyping(true);
    let i = 0;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timerRef.current);
        setTyping(false);
      }
    }, 45);
  }, []);

  // On mount — type initial message
  useEffect(() => {
    typeOut(target);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When state changes → erase then retype
  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;

    // Erase current text first
    setTyping(true);
    let eraseLen = displayed.length;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      eraseLen--;
      setDisplayed((prev) => prev.slice(0, eraseLen));
      if (eraseLen <= 0) {
        clearInterval(timerRef.current);
        // Small pause before typing new message
        setTimeout(() => typeOut(target), 200);
      }
    }, 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <p className="hero-label">
      <span className="hero-label-text">{displayed}</span>
      <span className="hero-label-cursor">_</span>
    </p>
  );
}

// ── WMP 2008 Energy Waves Canvas ─────────────────────────────────
function VisualizerCanvas({ playing }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let t = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const { width: W, height: H } = canvas;
      
      if (!playing) {
          ctx.fillStyle = '#020408';
          ctx.fillRect(0, 0, W, H);
          return;
      }
      
      // Clear with slight trailing effect for motion blur
      ctx.fillStyle = 'rgba(2, 4, 8, 0.35)';
      ctx.fillRect(0, 0, W, H);

      // Cycle hue smoothly over time for that dynamic look
      const hue = (t * 0.6) % 360;
      const baseColor = `hsl(${hue}, 90%, 65%)`;
      const glowColor = `hsla(${hue}, 90%, 65%, 0.4)`;
      
      // Update global CSS variables to sync the whole page
      document.documentElement.style.setProperty('--dynamic-accent', baseColor);
      document.documentElement.style.setProperty('--dynamic-accent-glow', glowColor);

      // Draw vertical equalizer bars in background
      const numBars = 40;
      const barWidth = W / numBars;
      for (let i = 0; i < numBars; i++) {
         const bx = i * barWidth;
         const barHeight = Math.abs(Math.sin(i * 0.4 + t * 0.1) * Math.cos(i * 0.2 + t * 0.05)) * (H * 0.6) + 10;
         ctx.fillStyle = `hsla(${(hue + i * 2) % 360}, 80%, 45%, 0.15)`;
         ctx.fillRect(bx, H - barHeight, barWidth - 1, barHeight);
      }

      // Draw WMP 2008 style sweeping fluid waves
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      for (let w = 0; w < 3; w++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) {
           const normX = x / W;
           const y1 = Math.sin(normX * 8 + t * 0.04 + w * 2.5) * (H * 0.25);
           const y2 = Math.cos(normX * 6 - t * 0.02 + w) * (H * 0.15);
           const y = H / 2 + y1 + y2;
           if (x === 0) ctx.moveTo(x, y);
           else ctx.lineTo(x, y);
        }
        ctx.lineWidth = 4 - w;
        ctx.strokeStyle = `hsla(${(hue + w * 40) % 360}, 100%, 70%, ${1 - (w * 0.2)})`;
        ctx.stroke();
      }

      t++;
      rafRef.current = requestAnimationFrame(draw);
    };

    if (playing) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      draw(); // Draw idle frame
      document.documentElement.style.setProperty('--dynamic-accent', 'var(--accent)');
      document.documentElement.style.setProperty('--dynamic-accent-glow', 'var(--accent-glow)');
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [playing]);

  return (
    <canvas
      ref={canvasRef}
      className="visualizer-canvas"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}

// ── Album Art Visual ───────────────────────────────────────────
function AlbumArt({ playing }) {
  return (
    <div className="album-art">
      <div className="album-art-visual">
        <VisualizerCanvas playing={playing} />
        {!playing && <span className="album-art-idle">OFFLINE</span>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  HOME PAGE
// ══════════════════════════════════════════════════════════════
export default function Home() {
  const audioRef = useRef(null);
  const heartbeatRef = useRef(null);
  const pollRef = useRef(null);
  const positionTimerRef = useRef(null);

  const [status, setStatus] = useState(null);
  const [tuned, setTuned] = useState(false);
  const tunedRef = useRef(false);

  useEffect(() => {
    tunedRef.current = tuned;
  }, [tuned]);
  const [loading, setLoading] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');

  // Derive terminal label state
  const labelState = loading
    ? 'loading'
    : tuned && status?.playing
      ? 'playing'
      : !tuned && status?.playing
        ? 'offline'
        : status?.totalTracks === 0
          ? 'empty'
          : 'offline';

  // ── Fetch initial status & stats ─────────────────────────
  useEffect(() => {
    fetchStatus();
    fetchStats();
    fetchHistory();

    const evtSource = new EventSource('/api/radio/events');
    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.event === 'track_change') {
          fetchStatus(true);
          fetchHistory();
        }
      } catch (_) { }
    };
    evtSource.onerror = () => { };

    return () => {
      evtSource.close();
      clearInterval(heartbeatRef.current);
      clearInterval(pollRef.current);
      clearInterval(positionTimerRef.current);
    };
  }, []);

  const fetchStatus = async (resync = false) => {
    try {
      const { data } = await api.get('/radio/status');
      setStatus(data);
      if (resync && tunedRef.current && data.playing) syncAudio(data);
    } catch (_) { }
  };

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/stats');
      setStats(data);
    } catch (_) { }
  };

  const fetchHistory = async () => {
    try {
      const { data } = await api.get('/history');
      setHistory(data.history || []);
    } catch (_) { }
  };

  // ── Smooth position progress ──────────────────────────────
  useEffect(() => {
    clearInterval(positionTimerRef.current);
    if (tuned && status?.playing) {
      positionTimerRef.current = setInterval(() => {
        setPositionMs((prev) => {
          const next = prev + 1000;
          return next >= (status.durationMs || status.track?.durationMs || Infinity) ? prev : next;
        });
      }, 1000);
    }
    return () => clearInterval(positionTimerRef.current);
  }, [tuned, status]);

  // ── Audio sync helper ─────────────────────────────────────
  const syncAudio = useCallback((s) => {
    if (!audioRef.current || !s?.playing) return;
    const audio = audioRef.current;
    const newSrc = `/uploads/${s.track.filename}`;

    if (audio.src !== window.location.origin + newSrc) {
      audio.src = newSrc;
    }

    const onCanPlay = () => {
      audio.currentTime = (s.positionMs || 0) / 1000;
      audio.play().catch(() => { });
      setPositionMs(s.positionMs || 0);
      audio.removeEventListener('canplay', onCanPlay);
    };

    audio.addEventListener('canplay', onCanPlay);
    audio.load();
  }, []);

  // ── Tune In / Out ─────────────────────────────────────────
  const tuneIn = async () => {
    if (!status?.playing) {
      setError('La señal no está disponible ahora mismo.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { data: fresh } = await api.get('/radio/status');
      setStatus(fresh);

      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.volume = volume;
      audioRef.current = audio;

      syncAudio(fresh);
      setTuned(true);

      clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        api.post('/radio/heartbeat').catch(() => { });
      }, 30_000);
      api.post('/radio/heartbeat').catch(() => { });

      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        fetchStatus();
        fetchStats();
      }, 15_000);

    } catch (err) {
      setError('No se pudo conectar con la señal.');
    } finally {
      setLoading(false);
    }
  };

  const tuneOut = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setTuned(false);
    clearInterval(heartbeatRef.current);
    clearInterval(pollRef.current);
  };

  // ── Volume control ────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted]);

  const currentTrack = status?.track;
  const durationMs = currentTrack?.durationMs || 0;
  const progressPct = durationMs > 0 ? Math.min((positionMs / durationMs) * 100, 100) : 0;

  return (
    <div className="page">
      {/* Navbar */}
      <nav className="navbar">
        <Link to="/" className="navbar-brand"></Link>
        <ul className="navbar-links">
          <li><Link to="/login">DJ ↗</Link></li>
        </ul>
      </nav>

      {/* Hero + Player */}
      <section className="hero">
        {/* Interactive terminal label */}
        <TerminalLabel state={labelState} />

        <h1 className="hero-title" data-text="SHUFFLE ZONE">SHUFFLE ZONE</h1>
        <p className="hero-subtitle">Signal from the outworld</p>

        <div className="player-card fade-in">
          {/* Live / Off-air badge */}
          {status?.playing ? (
            <div className="live-badge">
              <div className="live-dot" />
              LIVE SIGNAL
            </div>
          ) : (
            <div className="offair-badge">
              <div className="offair-dot" />
              OFF-AIR
            </div>
          )}

          {/* Album art — tunnel when playing, offline otherwise */}
          <AlbumArt playing={tuned && status?.playing} />

          {/* Track info */}
          <div className="track-info">
            {status?.playing && currentTrack ? (
              <>
                <div className="track-title">{currentTrack.title}</div>
                <div className="track-artist">{currentTrack.artist}</div>
                {currentTrack.album && (
                  <div className="track-album">{currentTrack.album}</div>
                )}
              </>
            ) : (
              <div className="track-idle-text">
                {status?.totalTracks === 0
                  ? 'no tracks loaded yet...'
                  : 'waiting for signal...'}
              </div>
            )}
          </div>

          {/* Progress bar */}
          {status?.playing && tuned && (
            <div className="progress-container">
              <div className="progress-times">
                <span>{formatTime(positionMs)}</span>
                <span>{formatTime(durationMs)}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="controls">
            <button
              className={`btn-tune ${tuned ? 'tuned-out' : ''}`}
              onClick={tuned ? tuneOut : tuneIn}
              disabled={loading || !status?.playing}
            >
              {loading ? (
                <span className="spinner" />
              ) : tuned ? (
                '⬛ TUNE OUT'
              ) : (
                '▶ TUNE IN'
              )}
            </button>

            <div className="volume-control">
              <span
                className="volume-icon"
                onClick={() => setMuted((m) => !m)}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? '🔇' : volume > 0.5 ? '🔊' : '🔈'}
              </span>
              <input
                type="range"
                className="volume-slider"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => {
                  setVolume(parseFloat(e.target.value));
                  setMuted(false);
                }}
              />
            </div>
          </div>

          {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

          {/* Listener count */}
          <p className="listener-count">
            <span>{status?.listeners ?? 0}</span> listener{(status?.listeners ?? 0) !== 1 ? 's' : ''} tuned in
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="stats-section">
        <div className="container">
          <p className="section-title">// station statistics</p>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats?.listeners ?? 0}</div>
              <div className="stat-label">Active Listeners</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats?.tracksPlayedToday ?? 0}</div>
              <div className="stat-label">Tracks Today</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats?.totalTracks ?? 0}</div>
              <div className="stat-label">In Library</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 14, lineHeight: 1.4 }}>
                {stats?.topTrack?.title || '—'}
              </div>
              <div className="stat-label">Most Played</div>
              {stats?.topTrack?.artist && (
                <div className="stat-sub">{stats.topTrack.artist} · {stats.topTrack.plays} plays</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Recent History */}
      {history.length > 0 && (
        <section className="history-section">
          <div className="container">
            <p className="section-title">// recently played</p>
            <div className="history-list">
              {history.map((item, i) => (
                <div className="history-item" key={i}>
                  <span className="history-num">{String(i + 1).padStart(2, '0')}</span>
                  <div className="history-info">
                    <div className="history-title">{item.title}</div>
                    <div className="history-artist">{item.artist}</div>
                  </div>
                  <span className="history-time">{timeAgo(item.played_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="footer">
        <p className="footer-text">
          shuffle zone - Radio Broadcasting &nbsp;·&nbsp;{' '}
          <Link to="/login">DJ access</Link>
        </p>
      </footer>
    </div>
  );
}