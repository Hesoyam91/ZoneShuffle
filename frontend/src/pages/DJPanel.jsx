import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

function formatTime(ms) {
  if (!ms) return '--:--';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('es', {
    hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric',
  });
}

// ══════════════════════════════════════════════════════════════
//  DJ PANEL
// ══════════════════════════════════════════════════════════════
export default function DJPanel() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'playlist' | 'stats'
  const [authorized, setAuthorized] = useState(null);
  const [username, setUsername] = useState('');

  // Upload state
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', artist: '', album: '' });
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState({ type: '', text: '' });

  // Playlist state
  const [tracks, setTracks] = useState([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);

  // Stats state
  const [djStats, setDjStats] = useState(null);
  const [radioStatus, setRadioStatus] = useState(null);

  // ── Auth check ─────────────────────────────────────────────
  useEffect(() => {
    api.get('/auth/verify')
      .then(({ data }) => {
        setAuthorized(true);
        setUsername(data.username);
      })
      .catch(() => navigate('/login'));
  }, [navigate]);

  useEffect(() => {
    if (authorized) {
      fetchPlaylist();
      fetchDJStats();
      fetchStatus();
      const interval = setInterval(() => {
        fetchStatus();
        fetchDJStats();
      }, 10_000);
      return () => clearInterval(interval);
    }
  }, [authorized]);

  const fetchPlaylist = async () => {
    setPlaylistLoading(true);
    try {
      const { data } = await api.get('/dj/playlist');
      setTracks(data.tracks || []);
    } catch (_) {}
    setPlaylistLoading(false);
  };

  const fetchDJStats = async () => {
    try {
      const { data } = await api.get('/dj/stats');
      setDjStats(data);
    } catch (_) {}
  };

  const fetchStatus = async () => {
    try {
      const { data } = await api.get('/radio/status');
      setRadioStatus(data);
    } catch (_) {}
  };

  const logout = async () => {
    await api.post('/auth/logout');
    navigate('/login');
  };

  // ── Upload ─────────────────────────────────────────────────
  const handleFileSelect = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setUploadMsg({ type: '', text: '' });

    // Auto-fill title from filename
    const name = file.name.replace(/\.(mp3|flac|wav|ogg|aac|m4a|zip)$/i, '');
    const parts = name.split(' - ');
    if (parts.length >= 2) {
      setUploadForm((f) => ({ ...f, artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() }));
    } else {
      setUploadForm((f) => ({ ...f, title: name }));
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadMsg({ type: '', text: '' });

    const formData = new FormData();
    formData.append('audio', selectedFile);
    formData.append('title', uploadForm.title);
    formData.append('artist', uploadForm.artist);
    formData.append('album', uploadForm.album);

    try {
      const { data } = await api.post('/dj/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadMsg({
        type: 'success',
        text: data.message ? `✓ ${data.message}` : `✓ "${data.title}" uploaded successfully (${formatTime(data.durationMs)})`,
      });
      setSelectedFile(null);
      setUploadForm({ title: '', artist: '', album: '' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchPlaylist();
      fetchDJStats();
    } catch (err) {
      setUploadMsg({
        type: 'error',
        text: err.response?.data?.error || 'Upload failed.',
      });
    } finally {
      setUploading(false);
    }
  };

  // ── Playlist actions ───────────────────────────────────────
  const toggleTrack = async (id) => {
    await api.patch(`/dj/tracks/${id}/toggle`);
    fetchPlaylist();
  };

  const deleteTrack = async (id, title) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await api.delete(`/dj/tracks/${id}`);
    fetchPlaylist();
    fetchDJStats();
  };

  const skip = async () => {
    await api.post('/dj/skip');
    fetchStatus();
  };

  // ── Loading / Auth ─────────────────────────────────────────
  if (authorized === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  const currentTrackId = radioStatus?.track?.id;

  return (
    <div className="page dj-page">
      <div className="container">
        {/* Header */}
        <div className="dj-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p className="dj-title">ZONE SHUFFLE // DJ PANEL</p>
              <p className="dj-subtitle">logged in as {username}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Link to="/" className="btn-secondary" style={{ display: 'inline-block', lineHeight: 1 }}>
                ← Station
              </Link>
              <button className="btn-secondary" onClick={logout}>Logout</button>
            </div>
          </div>

          {/* Now playing indicator */}
          {radioStatus?.playing && (
            <div style={{
              marginTop: 16,
              padding: '10px 14px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="live-dot" style={{ width: 6, height: 6 }} />
                <span style={{ fontSize: 9, fontFamily: 'var(--font-pixel)', color: 'var(--accent)', letterSpacing: '0.1em' }}>
                  ON AIR
                </span>
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
                {radioStatus.track.title}
                <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                  by {radioStatus.track.artist}
                </span>
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                {formatTime(radioStatus.positionMs)} / {formatTime(radioStatus.track.durationMs)}
              </span>
              <button className="btn-skip" onClick={skip}>
                ⏭ SKIP
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="dj-nav">
          {[
            { key: 'upload', label: '↑ Upload' },
            { key: 'playlist', label: '☰ Playlist' },
            { key: 'stats', label: '◎ Stats' },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`dj-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── UPLOAD TAB ──────────────────────────────────────── */}
        {activeTab === 'upload' && (
          <div className="fade-in">
            {/* Drop zone */}
            <div
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="upload-icon">🎵</div>
              {selectedFile ? (
                <>
                  <p className="upload-text" style={{ color: 'var(--accent)' }}>{selectedFile.name}</p>
                  <p className="upload-sub">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB · click to change</p>
                </>
              ) : (
                <>
                  <p className="upload-text">Drop audio or ZIP file here or click to browse</p>
                  <p className="upload-sub">MP3 · FLAC · WAV · OGG · AAC · ZIP · up to 150 MB</p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.zip,application/zip"
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelect(e.target.files[0])}
            />

            {/* Metadata form */}
            {selectedFile && (
              <form className="upload-form" onSubmit={handleUpload}>
                <div className="upload-form-grid">
                  <div className="form-group">
                    <label className="form-label">Title *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Track title"
                      value={uploadForm.title}
                      onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Artist</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Artist name"
                      value={uploadForm.artist}
                      onChange={(e) => setUploadForm((f) => ({ ...f, artist: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Album</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Album (optional)"
                      value={uploadForm.album}
                      onChange={(e) => setUploadForm((f) => ({ ...f, album: e.target.value }))}
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={uploading}>
                  {uploading ? <span className="spinner" style={{ display: 'inline-block' }} /> : '↑ UPLOAD TO STATION'}
                </button>

                {uploadMsg.text && (
                  <p className={uploadMsg.type === 'success' ? 'success-msg' : 'error-msg'}>
                    {uploadMsg.text}
                  </p>
                )}
              </form>
            )}
          </div>
        )}

        {/* ── PLAYLIST TAB ─────────────────────────────────────── */}
        {activeTab === 'playlist' && (
          <div className="fade-in">
            <div className="actions-row">
              <button className="btn-secondary" onClick={fetchPlaylist}>↻ Refresh</button>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {tracks.filter((t) => t.active).length} active / {tracks.length} total
              </span>
            </div>

            {playlistLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} />
              </div>
            ) : tracks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📻</div>
                <p className="empty-text">No tracks yet</p>
                <p className="empty-sub">Upload your first track to start broadcasting</p>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <table className="playlist-table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th>
                      <th>Title</th>
                      <th>Artist</th>
                      <th>Duration</th>
                      <th>Plays</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((track, i) => (
                      <tr key={track.id}>
                        <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                          {currentTrackId === track.id ? (
                            <span className="playing-now-indicator">▶</span>
                          ) : (
                            String(i + 1).padStart(2, '0')
                          )}
                        </td>
                        <td>
                          <span style={{ color: currentTrackId === track.id ? 'var(--accent)' : 'var(--text-primary)' }}>
                            {track.title}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{track.artist}</td>
                        <td style={{ color: 'var(--text-dim)' }}>{formatTime(track.duration_ms)}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{track.plays}</td>
                        <td>
                          {track.active ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--green)' }}>
                              <span className="track-active-dot" />active
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-dim)' }}>
                              <span className="track-inactive-dot" />inactive
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn-toggle"
                              onClick={() => toggleTrack(track.id)}
                              title={track.active ? 'Deactivate' : 'Activate'}
                            >
                              {track.active ? 'hide' : 'show'}
                            </button>
                            <button
                              className="btn-danger"
                              onClick={() => deleteTrack(track.id, track.title)}
                            >
                              del
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── STATS TAB ─────────────────────────────────────────── */}
        {activeTab === 'stats' && (
          <div className="fade-in">
            {djStats ? (
              <>
                <div className="dj-stats-grid">
                  <div className="dj-stat-card">
                    <div className="dj-stat-value">{djStats.totalTracks}</div>
                    <div className="dj-stat-label">Total Tracks</div>
                  </div>
                  <div className="dj-stat-card">
                    <div className="dj-stat-value">{djStats.activeTracks}</div>
                    <div className="dj-stat-label">Active</div>
                  </div>
                  <div className="dj-stat-card">
                    <div className="dj-stat-value">{djStats.totalPlays}</div>
                    <div className="dj-stat-label">Total Plays</div>
                  </div>
                  <div className="dj-stat-card">
                    <div className="dj-stat-value">{djStats.tracksToday}</div>
                    <div className="dj-stat-label">Plays Today</div>
                  </div>
                </div>

                {djStats.topTracks?.length > 0 && (
                  <div>
                    <p className="section-title" style={{ textAlign: 'left', marginBottom: 16 }}>
                      // most played
                    </p>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' }}>
                      {djStats.topTracks.map((track, i) => (
                        <div className="top-track-item" key={track.id}>
                          <span className="top-track-rank">{String(i + 1).padStart(2, '0')}</span>
                          <div className="top-track-info">
                            <div className="top-track-title">{track.title}</div>
                            <div className="top-track-artist">{track.artist}</div>
                          </div>
                          <span className="top-track-plays">{track.plays} plays</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {radioStatus?.playing && (
                  <div style={{ marginTop: 24 }}>
                    <p className="section-title" style={{ textAlign: 'left', marginBottom: 16 }}>
                      // current broadcast
                    </p>
                    <div style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border-active)',
                      borderRadius: 'var(--radius)', padding: 20
                    }}>
                      <p style={{ fontSize: 16, color: 'var(--text-bright)', marginBottom: 4 }}>
                        {radioStatus.track.title}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--accent)' }}>{radioStatus.track.artist}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                        {formatTime(radioStatus.positionMs)} / {formatTime(radioStatus.track.durationMs)}
                        {' · '}
                        {radioStatus.listeners} listener{radioStatus.listeners !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
