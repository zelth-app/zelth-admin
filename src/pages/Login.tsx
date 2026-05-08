import { useState } from 'react'
import { ADMIN_PASSWORD } from '../lib/supabase'

interface LoginProps {
  onLogin: () => void
}

export function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      if (password === ADMIN_PASSWORD) {
        sessionStorage.setItem('zelth_admin_auth', 'true')
        onLogin()
      } else {
        setError('Incorrect password')
        setPassword('')
      }
      setLoading(false)
    }, 400)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 360, padding: 40, background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'var(--orange)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 24, color: '#000', margin: '0 auto 14px',
          }}>Z</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>Zelth Admin</div>
          <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>Operations Dashboard</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              autoFocus
            />
            {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</div>}
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }} disabled={loading || !password}>
            {loading ? 'Verifying...' : 'Enter Dashboard'}
          </button>
        </form>
      </div>
    </div>
  )
}
