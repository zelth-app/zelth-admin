import { useEffect, useState } from 'react'
import { supabase, adminDb } from '../lib/supabase'
import { toast } from '../components/Toast'
import { RefreshCw, ChevronDown, ChevronUp, ExternalLink, Edit2, Check } from 'lucide-react'

const FITNESS_GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Lose Weight',
  build_muscle: 'Build Muscle',
  build_stamina: 'Build Stamina',
  stay_active: 'Stay Active',
  lose_weight_build_muscle: 'Lose Weight + Build Muscle',
}

interface PendingUser {
  id: string
  name: string | null
  phone: string
  fitness_goals: string[] | null
  height_cm: number | null
  weight_kg: number | null
  subscription_start: string | null
  subscription_end: string | null
  trial_used: boolean | null
}

interface ActiveCoachUser {
  id: string
  name: string | null
  phone: string
  fitness_goals: string[] | null
  coach_dashboard_url: string | null
  subscription_end: string | null
}

export function Coach() {
  const [pending, setPending] = useState<PendingUser[]>([])
  const [active, setActive] = useState<ActiveCoachUser[]>([])
  const [loadingPending, setLoadingPending] = useState(true)
  const [loadingActive, setLoadingActive] = useState(true)
  const [dashboardUrls, setDashboardUrls] = useState<Record<string, string>>({})
  const [activating, setActivating] = useState<string | null>(null)
  const [editUrls, setEditUrls] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [deactivateConfirm, setDeactivateConfirm] = useState<string | null>(null)
  const [activeCollapsed, setActiveCollapsed] = useState(false)

  useEffect(() => { loadPending(); loadActive() }, [])

  async function loadPending() {
    setLoadingPending(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, phone, fitness_goals, height_cm, weight_kg, subscription_start, subscription_end, trial_used')
        .gt('subscription_end', new Date().toISOString())
        .eq('coach_active', false)
        .order('subscription_start', { ascending: true })
      if (error) throw error
      setPending(data || [])
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoadingPending(false)
    }
  }

  async function loadActive() {
    setLoadingActive(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, phone, fitness_goals, coach_dashboard_url, subscription_end')
        .eq('coach_active', true)
        .order('subscription_end', { ascending: false })
      if (error) throw error
      setActive(data || [])
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoadingActive(false)
    }
  }

  function refresh() {
    loadPending()
    loadActive()
  }

  function getGoalLabel(goals: string[] | null) {
    if (!goals || goals.length === 0) return '—'
    return FITNESS_GOAL_LABELS[goals[0]] || goals[0]
  }

  async function handleActivate(user: PendingUser) {
    const url = (dashboardUrls[user.id] || '').trim()
    if (!url) {
      toast('Dashboard URL is required', 'error')
      return
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast('URL must start with http:// or https://', 'error')
      return
    }
    setActivating(user.id)
    try {
      await adminDb('update', {
        table: 'users',
        data: { coach_active: true, coach_dashboard_url: url },
        filters: { id: user.id },
      })
      toast(`Coach activated for ${user.name || user.phone}`)
      setDashboardUrls(prev => { const n = { ...prev }; delete n[user.id]; return n })
      refresh()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setActivating(null)
    }
  }

  async function handleSaveUrl(user: ActiveCoachUser) {
    const url = (editUrls[user.id] || '').trim()
    if (!url) {
      toast('Dashboard URL is required', 'error')
      return
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast('URL must start with http:// or https://', 'error')
      return
    }
    setSaving(user.id)
    try {
      await adminDb('update', {
        table: 'users',
        data: { coach_dashboard_url: url },
        filters: { id: user.id },
      })
      toast('Dashboard URL updated')
      setEditingId(null)
      loadActive()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSaving(null)
    }
  }

  async function handleDeactivate(userId: string) {
    setSaving(userId)
    try {
      await adminDb('update', {
        table: 'users',
        data: { coach_active: false },
        filters: { id: userId },
      })
      toast('Coach access deactivated')
      setDeactivateConfirm(null)
      refresh()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Coach Management</div>
          <div className="page-subtitle">Activate and manage coach dashboard access for users</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refresh}><RefreshCw size={13} /> Refresh</button>
      </div>

      {/* Section 1: Pending Setup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Pending Setup</div>
        <span className="badge badge-pending">{pending.length}</span>
      </div>
      <div className="card" style={{ padding: 0, marginBottom: 28 }}>
        {loadingPending ? (
          <div className="loading">Loading...</div>
        ) : pending.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✅</div>
            <div className="empty-text">No users pending coach setup</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Goal</th>
                  <th>Height</th>
                  <th>Weight</th>
                  <th>Subscribed On</th>
                  <th>Type</th>
                  <th>Dashboard URL</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{user.name || <span style={{ color: 'var(--text3)' }}>—</span>}</div>
                    </td>
                    <td className="mono">{user.phone}</td>
                    <td style={{ color: 'var(--text2)' }}>{getGoalLabel(user.fitness_goals)}</td>
                    <td style={{ color: 'var(--text2)' }}>{user.height_cm != null ? `${user.height_cm} cm` : '—'}</td>
                    <td style={{ color: 'var(--text2)' }}>{user.weight_kg != null ? `${user.weight_kg} kg` : '—'}</td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>
                      {user.subscription_start ? new Date(user.subscription_start).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td>
                      {user.trial_used === false ? (
                        <span className="badge badge-pending">Trial</span>
                      ) : (
                        <span className="badge badge-verified">Returning</span>
                      )}
                    </td>
                    <td style={{ minWidth: 280 }}>
                      <input
                        className="input"
                        style={{ fontSize: 12 }}
                        placeholder="https://coach.example.com/dashboard/..."
                        value={dashboardUrls[user.id] || ''}
                        onChange={e => setDashboardUrls(prev => ({ ...prev, [user.id]: e.target.value }))}
                      />
                    </td>
                    <td>
                      <button
                        className="btn btn-success btn-sm"
                        disabled={activating === user.id}
                        onClick={() => handleActivate(user)}
                      >
                        {activating === user.id ? 'Activating...' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Active Coach Users */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: '3px 7px' }}
          onClick={() => setActiveCollapsed(c => !c)}
        >
          {activeCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Active Coach Users</div>
        <span className="badge badge-verified">{active.length}</span>
      </div>

      {!activeCollapsed && (
        <div className="card" style={{ padding: 0 }}>
          {loadingActive ? (
            <div className="loading">Loading...</div>
          ) : active.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🏋️</div>
              <div className="empty-text">No active coach users</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Goal</th>
                    <th>Dashboard URL</th>
                    <th>Subscription Ends</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(user => (
                    <tr key={user.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{user.name || <span style={{ color: 'var(--text3)' }}>—</span>}</div>
                      </td>
                      <td className="mono">{user.phone}</td>
                      <td style={{ color: 'var(--text2)' }}>{getGoalLabel(user.fitness_goals)}</td>
                      <td style={{ minWidth: 260 }}>
                        {editingId === user.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              className="input"
                              style={{ fontSize: 12 }}
                              value={editUrls[user.id] ?? (user.coach_dashboard_url || '')}
                              onChange={e => setEditUrls(prev => ({ ...prev, [user.id]: e.target.value }))}
                              autoFocus
                            />
                            <button
                              className="btn btn-success btn-sm"
                              disabled={saving === user.id}
                              onClick={() => handleSaveUrl(user)}
                            >
                              <Check size={12} />
                            </button>
                          </div>
                        ) : user.coach_dashboard_url ? (
                          <a
                            href={user.coach_dashboard_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                            title={user.coach_dashboard_url}
                          >
                            <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                              {user.coach_dashboard_url}
                            </span>
                            <ExternalLink size={11} style={{ flexShrink: 0 }} />
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text3)' }}>—</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text3)', fontSize: 12 }}>
                        {user.subscription_end ? new Date(user.subscription_end).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {editingId === user.id ? (
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setEditingId(user.id)
                                setEditUrls(prev => ({ ...prev, [user.id]: user.coach_dashboard_url || '' }))
                              }}
                            >
                              <Edit2 size={12} /> Edit URL
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeactivateConfirm(user.id)}
                          >
                            Deactivate
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

      {deactivateConfirm && (
        <div className="modal-overlay" onClick={() => setDeactivateConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Deactivate Coach Access</div>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
              Are you sure? This user will lose access to their coach dashboard.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setDeactivateConfirm(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                style={{ flex: 2 }}
                disabled={saving === deactivateConfirm}
                onClick={() => handleDeactivate(deactivateConfirm)}
              >
                {saving === deactivateConfirm ? 'Deactivating...' : 'Yes, Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
