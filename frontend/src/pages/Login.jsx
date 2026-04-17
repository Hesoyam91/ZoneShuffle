import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/login', form);
      navigate('/dj');
    } catch (err) {
      setError(err.response?.data?.error || 'Credenciales incorrectas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card fade-in">
        <p className="login-logo">ZONE SHUFFLE</p>
        <p className="login-sub">// dj access only</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              className="form-input"
              placeholder="enter username"
              autoComplete="username"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ marginTop: 24 }}
          >
            {loading ? <span className="spinner" style={{ display: 'inline-block' }} /> : '↵ ACCESS PANEL'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'var(--text-dim)' }}>
          <Link to="/">← back to station</Link>
        </p>
      </div>
    </div>
  );
}
