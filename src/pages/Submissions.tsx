import { useEffect, useState } from 'react'
import { supabase, adminDb, callEdge, SERVICE_SECRET } from '../lib/supabase'
import { toast } from '../components/Toast'
import { ExternalLink, Check, X, RefreshCw, Download } from 'lucide-react'
import { exportCsv } from '../lib/exportCsv'

interface Submission {
  submission_id: string
  status: string
  strava_url: string
  rejection_reason: string | null
  submitted_at: string
  verified_at: string | null
  user_name: string
  phone: string
  challenge_title: string
  entry_fee: number
  participant_id: string
  challenge_id: string
  user_id: string
  wallet_id: string
  wallet_balance: number
}

interface VerifyModal {
  submission: Submission
  amount: string
  winCode: string
  note: string
}

interface RejectModal {
  submission: Submission
  reason: string
}

export function Submissions() {
  const [rows, setRows] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('submitted')
  const [search, setSearch] = useState('')
  const [verifyModal, setVerifyModal] = useState<VerifyModal | null>(null)
  const [rejectModal, setRejectModal] = useState<RejectModal | null>(null)
  const [saving, setSaving] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    try {
      let q = supabase
        .from('activity_submissions')
        .select(`
          id, status, strava_url, rejection_reason, submitted_at, verified_at,
          users!inner(id, name, phone),
          challenge_participants!inner(id, challenge_id),
          challenges!inner(id, title, entry_fee),
          wallet:users!inner(wallet(id, balance))
        `)
        .order('submitted_at', { ascending: false })

      if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter)
      }

      const { data, error } = await q
      if (error) throw error

      const mapped = (data || []).map((row: any) => ({
        submission_id: row.id,
        status: row.status,
        strava_url: row.strava_url,
        rejection_reason: row.rejection_reason,
        submitted_at: row.submitted_at,
        verified_at: row.verified_at,
        user_name: row.users?.name || '—',
        phone: row.users?.phone || '—',
        challenge_title: row.challenges?.title || '—',
        entry_fee: Number(row.challenges?.entry_fee || 0),
        participant_id: row.challenge_participants?.id,
        challenge_id: row.challenge_participants?.challenge_id,
        user_id: row.users?.id,
        wallet_id: row.users?.wallet?.[0]?.id,
        wallet_balance: Number(row.users?.wallet?.[0]?.balance || 0),
      }))

      setRows(mapped)
    } catch (e: any) {
      toast(e.message || 'Failed to load', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    if (!verifyModal) return
    const amount = Number(verifyModal.amount)
    if (!amount || amount <= 0) { toast('Enter a valid prize amount', 'error'); return }
    setSaving(true)
    try {
      await adminDb('update', {
        table: 'activity_submissions',
        data: { status: 'verified', verified_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        filters: { id: verifyModal.submission.submission_id },
      })

      await callEdge('credit-wallet', {
        service_secret: SERVICE_SECRET,
        user_id: verifyModal.submission.user_id,
        participant_id: verifyModal.submission.participant_id,
        challenge_id: verifyModal.submission.challenge_id,
        amount,
        reward_type: 'prize',
        win_code: verifyModal.winCode || undefined,
        note: verifyModal.note || `${verifyModal.submission.challenge_title} — verified run`,
      })

      toast(`✅ Run verified! ₹${amount} credited to wallet`)
      setVerifyModal(null)
      load()
    } catch (e: any) {
      toast(e.message || 'Failed to verify', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleReject() {
    if (!rejectModal) return
    if (!rejectModal.reason.trim()) { toast('Enter a rejection reason', 'error'); return }
    setSaving(true)
    try {
      await adminDb('update', {
        table: 'activity_submissions',
        data: {
          status: 'rejected',
          rejection_reason: rejectModal.reason,
          updated_at: new Date().toISOString(),
        },
        filters: { id: rejectModal.submission.submission_id },
      })
      toast('Run rejected')
      setRejectModal(null)
      load()
    } catch (e: any) {
      toast(e.message || 'Failed to reject', 'error')
    } finally {
      setSaving(false)
    }
  }

  const filtered = rows.filter(r => {
    const matchSearch = !search || r.phone.includes(search) || r.user_name.toLowerCase().includes(search.toLowerCase())
    const matchFrom = !dateFrom || new Date(r.submitted_at) >= new Date(dateFrom)
    const matchTo = !dateTo || new Date(r.submitted_at) <= new Date(dateTo)
    return matchSearch && matchFrom && matchTo
  })

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Submissions</div>
          <div className="page-subtitle">Review and verify activity submissions</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCsv(
            filtered.map(r => ({
              submission_id: r.submission_id, user_name: r.user_name,
              phone: r.phone, challenge_title: r.challenge_title,
              strava_url: r.strava_url, status: r.status,
              rejection_reason: r.rejection_reason, submitted_at: r.submitted_at,
              verified_at: r.verified_at, entry_fee: r.entry_fee,
              wallet_balance: r.wallet_balance, participant_id: r.participant_id,
              user_id: r.user_id, challenge_id: r.challenge_id,
            })),
            'zelth_submissions'
          )}><Download size={13} /> Export CSV</button>
        </div>
      </div>

      <div className="filters">
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="submitted">Submitted</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
        <input className="input" style={{ width: 220 }} placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
        <input
          className="input"
          type="datetime-local"
          style={{ width: 210 }}
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          title="From date"
        />
        <input
          className="input"
          type="datetime-local"
          style={{ width: 210 }}
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          title="To date"
        />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { setDateFrom(''); setDateTo('') }}
          title="Clear dates"
        >
          ✕ Clear
        </button>
        <div style={{ color: 'var(--text3)', fontSize: 12 }}>
          {filtered.length} results
          {(dateFrom || dateTo) && ` (filtered)`}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">Loading submissions...</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">📋</div><div className="empty-text">No submissions found</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Challenge</th>
                  <th>Strava Link</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Wallet</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.submission_id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.user_name}</div>
                      <div className="mono" style={{ color: 'var(--text3)' }}>{row.phone}</div>
                    </td>
                    <td>
                      <div>{row.challenge_title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>₹{row.entry_fee} entry</div>
                    </td>
                    <td>
                      <a href={row.strava_url} target="_blank" rel="noopener noreferrer" className="link-cell" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ExternalLink size={11} /> View on Strava
                      </a>
                    </td>
                    <td>
                      <span className={`badge badge-${row.status}`}>{row.status}</span>
                      {row.rejection_reason && (
                        <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>{row.rejection_reason}</div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>
                      {new Date(row.submitted_at).toLocaleString('en-IN')}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--green)' }}>₹{row.wallet_balance.toLocaleString('en-IN')}</div>
                    </td>
                    <td>
                      {row.status === 'submitted' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-success btn-sm" onClick={() => setVerifyModal({ submission: row, amount: '', winCode: '', note: '' })}>
                            <Check size={12} /> Verify
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => setRejectModal({ submission: row, reason: '' })}>
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                      {row.status === 'verified' && <span style={{ color: 'var(--green)', fontSize: 12 }}>✓ Done</span>}
                      {row.status === 'rejected' && <span style={{ color: 'var(--red)', fontSize: 12 }}>✗ Rejected</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verify Modal */}
      {verifyModal && (
        <div className="modal-overlay" onClick={() => setVerifyModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">✅ Verify Run & Credit Wallet</div>
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>{verifyModal.submission.user_name}</div>
              <div style={{ color: 'var(--text2)', fontSize: 12 }}>{verifyModal.submission.phone} · {verifyModal.submission.challenge_title}</div>
              <div style={{ marginTop: 8 }}>
                <a href={verifyModal.submission.strava_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                  <ExternalLink size={12} /> Open Strava Link
                </a>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="label">Prize Amount (₹) *</label>
                <input className="input" type="number" placeholder="e.g. 500" value={verifyModal.amount}
                  onChange={e => setVerifyModal({ ...verifyModal, amount: e.target.value })} autoFocus />
              </div>
              <div>
                <label className="label">Win Code (optional)</label>
                <input className="input" placeholder="e.g. P1, C2" value={verifyModal.winCode}
                  onChange={e => setVerifyModal({ ...verifyModal, winCode: e.target.value })} />
              </div>
              <div>
                <label className="label">Note (optional)</label>
                <input className="input" placeholder="Internal note" value={verifyModal.note}
                  onChange={e => setVerifyModal({ ...verifyModal, note: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setVerifyModal(null)}>Cancel</button>
              <button className="btn btn-success" style={{ flex: 2 }} onClick={handleVerify} disabled={saving}>
                {saving ? 'Processing...' : `✅ Verify & Credit ₹${verifyModal.amount || '?'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">❌ Reject Submission</div>
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>{rejectModal.submission.user_name}</div>
              <div style={{ color: 'var(--text2)', fontSize: 12 }}>{rejectModal.submission.challenge_title}</div>
            </div>
            <div>
              <label className="label">Rejection Reason *</label>
              <textarea className="input" rows={3} placeholder="Explain why the run was rejected..."
                value={rejectModal.reason} onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
                style={{ resize: 'vertical' }} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setRejectModal(null)}>Cancel</button>
              <button className="btn btn-danger" style={{ flex: 2 }} onClick={handleReject} disabled={saving}>
                {saving ? 'Processing...' : '❌ Reject Submission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
