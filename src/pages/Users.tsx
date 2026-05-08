import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../components/Toast'
import { RefreshCw, Search } from 'lucide-react'

interface User {
  id: string
  phone: string
  name: string | null
  age: number | null
  city: string | null
  gender: string | null
  language: string
  upi_id: string | null
  created_at: string
  wallet_balance: number
  total_earned: number
  total_withdrawn: number
  join_count: number
}

export function Users() {
  const [rows, setRows] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`id, phone, name, age, city, gender, language, upi_id, created_at, wallet(balance, total_earned, total_withdrawn)`)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get join counts
      const userIds = (data || []).map((u: any) => u.id)
      const { data: joinData } = await supabase
        .from('challenge_participants')
        .select('user_id')
        .in('user_id', userIds)

      const joinMap: Record<string, number> = {}
      for (const j of joinData || []) {
        joinMap[j.user_id] = (joinMap[j.user_id] || 0) + 1
      }

      setRows((data || []).map((u: any) => ({
        id: u.id,
        phone: u.phone,
        name: u.name,
        age: u.age,
        city: u.city,
        gender: u.gender,
        language: u.language,
        upi_id: u.upi_id,
        created_at: u.created_at,
        wallet_balance: Number(u.wallet?.[0]?.balance || 0),
        total_earned: Number(u.wallet?.[0]?.total_earned || 0),
        total_withdrawn: Number(u.wallet?.[0]?.total_withdrawn || 0),
        join_count: joinMap[u.id] || 0,
      })))
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const filtered = rows.filter(r =>
    !search ||
    r.phone.includes(search) ||
    (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.city || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalUsers = rows.length
  const totalWallet = rows.reduce((s, r) => s + r.wallet_balance, 0)
  const totalEarned = rows.reduce((s, r) => s + r.total_earned, 0)

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Users</div>
          <div className="page-subtitle">All registered users and wallet info</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{totalUsers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Wallet Balance</div>
          <div className="stat-value" style={{ color: 'var(--orange)', fontSize: 20 }}>₹{totalWallet.toLocaleString('en-IN')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Earned (All Time)</div>
          <div className="stat-value" style={{ color: 'var(--green)', fontSize: 20 }}>₹{totalEarned.toLocaleString('en-IN')}</div>
        </div>
      </div>

      <div className="filters">
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input className="input" style={{ width: 260, paddingLeft: 30 }} placeholder="Search name, phone, city..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ color: 'var(--text3)', fontSize: 12 }}>{filtered.length} users</div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">Loading users...</div> : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">👥</div><div className="empty-text">No users found</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Challenges</th>
                  <th>Wallet</th>
                  <th>Total Earned</th>
                  <th>UPI ID</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{u.name || <span style={{ color: 'var(--text3)' }}>—</span>}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{u.age ? `${u.age}y` : ''} {u.gender || ''}</div>
                    </td>
                    <td className="mono">{u.phone}</td>
                    <td style={{ color: 'var(--text2)' }}>{u.city || '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{u.join_count}</td>
                    <td style={{ fontWeight: 600, color: u.wallet_balance > 0 ? 'var(--green)' : 'var(--text2)' }}>
                      ₹{u.wallet_balance.toLocaleString('en-IN')}
                    </td>
                    <td style={{ color: 'var(--orange)' }}>₹{u.total_earned.toLocaleString('en-IN')}</td>
                    <td className="mono" style={{ color: 'var(--text2)', fontSize: 11 }}>{u.upi_id || '—'}</td>
                    <td style={{ color: 'var(--text3)', fontSize: 11 }}>{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
