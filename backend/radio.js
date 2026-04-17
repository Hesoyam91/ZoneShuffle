/**
 * RadioStation - Manages the shared radio playback state.
 *
 * All listeners hear the same thing at the same time by:
 * 1. The server tracking: currentTrackIndex + trackStartedAt (Unix ms timestamp)
 * 2. Clients asking GET /api/radio/status → { track, positionMs }
 * 3. Clients seeking their audio element to positionMs on load
 *
 * Auto-advance: setTimeout schedules the next track.
 * On restart: reads DB state and resumes from correct position in playlist.
 */

const { getDB } = require('./db');

class RadioStation {
  constructor() {
    this.timer = null;
    this.sseClients = new Set();
  }

  // ── Playlist ──────────────────────────────────────────────────────────────

  getPlaylist() {
    const db = getDB();
    return db
      .prepare('SELECT * FROM tracks WHERE active = 1 ORDER BY position ASC, id ASC')
      .all();
  }

  // ── Persistent state ──────────────────────────────────────────────────────

  getState() {
    return getDB().prepare('SELECT * FROM radio_state WHERE id = 1').get();
  }

  saveState(index, startedAt) {
    getDB()
      .prepare('UPDATE radio_state SET current_index = ?, track_started_at = ? WHERE id = 1')
      .run(index, startedAt);
  }

  // ── Boot / Resume ─────────────────────────────────────────────────────────

  start() {
    const playlist = this.getPlaylist();
    if (playlist.length === 0) {
      console.log('[Radio] No tracks in playlist. Waiting for uploads.');
      return;
    }

    const state = this.getState();

    if (state && state.track_started_at > 0) {
      const elapsed = Date.now() - state.track_started_at;
      let idx = state.current_index % playlist.length;

      // Walk through playlist to find which track is currently "playing"
      let accum = elapsed;
      while (accum > 0) {
        const track = playlist[idx % playlist.length];
        if (accum < track.duration_ms) {
          // This is the current track, we're `accum` ms into it
          const resumeStartedAt = Date.now() - accum;
          this.saveState(idx % playlist.length, resumeStartedAt);
          this.scheduleNext(track.duration_ms - accum, idx % playlist.length);
          console.log(
            `[Radio] Resumed: "${track.title}" (${Math.floor(accum / 1000)}s in, ` +
            `${Math.floor((track.duration_ms - accum) / 1000)}s remaining)`
          );
          return;
        }
        accum -= track.duration_ms;
        idx++;
      }
    }

    // Nothing valid in state → start fresh
    this.playTrack(0);
  }

  // ── Playback control ──────────────────────────────────────────────────────

  playTrack(index) {
    const playlist = this.getPlaylist();
    if (playlist.length === 0) return;

    const idx = ((index % playlist.length) + playlist.length) % playlist.length;
    const track = playlist[idx];
    const startedAt = Date.now();

    this.saveState(idx, startedAt);

    // Record play
    const db = getDB();
    db.prepare('INSERT INTO play_history (track_id, played_at) VALUES (?, ?)').run(track.id, startedAt);
    db.prepare('UPDATE tracks SET plays = plays + 1 WHERE id = ?').run(track.id);

    console.log(`[Radio] ▶ Now playing: "${track.title}" by ${track.artist} (${Math.floor(track.duration_ms / 1000)}s)`);

    this.scheduleNext(track.duration_ms, idx);
    this.broadcast({
      event: 'track_change',
      track: {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        durationMs: track.duration_ms,
        filename: track.filename
      }
    });
  }

  scheduleNext(delayMs, currentIdx) {
    if (this.timer) clearTimeout(this.timer);
    const safeDelay = Math.max(delayMs, 500);
    this.timer = setTimeout(() => {
      const playlist = this.getPlaylist();
      if (playlist.length > 0) {
        this.playTrack((currentIdx + 1) % playlist.length);
      }
    }, safeDelay);
  }

  skip() {
    const playlist = this.getPlaylist();
    if (playlist.length === 0) return;
    const state = this.getState();
    const nextIdx = ((state.current_index || 0) + 1) % playlist.length;
    this.playTrack(nextIdx);
  }

  // Called when the playlist changes (upload, delete, toggle)
  restart() {
    if (this.timer) clearTimeout(this.timer);

    const playlist = this.getPlaylist();
    if (playlist.length === 0) {
      this.saveState(0, 0);
      return;
    }

    const state = this.getState();
    if (state.track_started_at === 0) {
      // Nothing was playing, start fresh
      this.playTrack(0);
    } else {
      // Already playing, re-calculate timers
      this.start();
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  getStatus() {
    const playlist = this.getPlaylist();
    const listeners = this.getListenerCount();

    if (playlist.length === 0) {
      return { playing: false, listeners, totalTracks: 0 };
    }

    const state = this.getState();
    if (!state || state.track_started_at === 0) {
      return { playing: false, listeners, totalTracks: playlist.length };
    }

    const idx = state.current_index % playlist.length;
    const track = playlist[idx];
    const positionMs = Math.min(Date.now() - state.track_started_at, track.duration_ms);

    return {
      playing: true,
      track: {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        filename: track.filename,
        durationMs: track.duration_ms
      },
      positionMs,
      listeners,
      totalTracks: playlist.length
    };
  }

  getListenerCount() {
    const db = getDB();
    const cutoff = Date.now() - 60_000; // active in last 60s
    return db
      .prepare('SELECT COUNT(*) as count FROM listener_heartbeats WHERE last_seen > ?')
      .get(cutoff).count;
  }

  // ── SSE broadcast ─────────────────────────────────────────────────────────

  addSSEClient(res) {
    this.sseClients.add(res);
    res.on('close', () => this.sseClients.delete(res));
  }

  broadcast(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    this.sseClients.forEach((res) => {
      try {
        res.write(msg);
      } catch {
        this.sseClients.delete(res);
      }
    });
  }
}

// Singleton
const radio = new RadioStation();
module.exports = radio;
