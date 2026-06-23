import { useEffect, useState } from 'react'
import { supabase, adminDb } from '../lib/supabase'
import { toast } from '../components/Toast'
import { RefreshCw, Plus, Edit2, ToggleLeft, ToggleRight, Download } from 'lucide-react'
import { exportCsv } from '../lib/exportCsv'

interface Challenge {
  id: string
  title: string
  entry_fee: number
  prize_pool: number
  is_active: boolean
  start_date: string
  end_date: string
  personal_window_days: number
  min_target: number
  target_unit: string
  sort_order: number
  total_slots: number
  challenge_type: string
  participant_count: number
  rules: string[]
  cashback_tiers: any[]
  video_url: string | null
  prize_pool_template_id: string | null
  has_pool: boolean
  pool: number[] | null
  pool_generation: number
}

interface ChallengeType {
  id: string
  name: string
  display_name: string
}

interface PrizeTemplate {
  id: string
  name: string
  description: string | null
  is_active: boolean
  prizes: number[]
}

const blankForm = {
  title: '', entry_fee: '', prize_pool: '', challenge_type_id: '',
  start_date: '', end_date: '', personal_window_days: '7',
  min_target: '', target_unit: 'meters', sort_order: '1',
  total_slots: '500', rules: '',
  cashback_tiers: '[{"min_km": 2, "percent": 20}, {"min_km": 5, "percent": 50}]',
  video_url: '', prize_pool_template_id: '',
}

export function Challenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [types, setTypes] = useState<ChallengeType[]>([])
  const [templates, setTemplates] = useState<PrizeTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState(blankForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [poolModal, setPoolModal] = useState<Challenge | null>(null)
  const [poolForm, setPoolForm] = useState({ prizes: '', template_id: '' })
  const [poolSaving, setPoolSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [chRes, { data: ty }, { data: counts }, { data: templateData }, { data: poolRows }] = await Promise.all([
        adminDb('select', { table: 'challenges', columns: '*, challenge_types(name, display_name)', order: { column: 'sort_order', ascending: true } }),
        supabase.from('challenge_types').select('id, name, display_name'),
        supabase.from('challenge_participants').select('challenge_id'),
        supabase.from('prize_pool_templates').select('id, name, description, is_active, prizes').eq('is_active', true).order('created_at'),
        supabase.from('challenge_prize_pools').select('challenge_id, pool, generation, is_active').eq('is_active', true),
      ])

      const ch = chRes.data

      const countMap: Record<string, number> = {}
      for (const c of counts || []) countMap[c.challenge_id] = (countMap[c.challenge_id] || 0) + 1

      const poolMap: Record<string, { pool: number[]; generation: number }> = {}
      for (const p of poolRows || []) poolMap[p.challenge_id] = { pool: p.pool || [], generation: p.generation || 1 }

      setChallenges((ch || []).map((c: any) => ({
        id: c.id, title: c.title,
        entry_fee: Number(c.entry_fee), prize_pool: Number(c.prize_pool),
        is_active: c.is_active, start_date: c.start_date, end_date: c.end_date,
        personal_window_days: c.personal_window_days, min_target: Number(c.min_target),
        target_unit: c.target_unit, sort_order: c.sort_order, total_slots: c.total_slots,
        challenge_type: c.challenge_types?.display_name || c.challenge_types?.name || '—',
        participant_count: countMap[c.id] || 0,
        rules: c.rules || [],
        cashback_tiers: c.cashback_tiers || [],
        video_url: c.video_url ?? null,
        prize_pool_template_id: c.prize_pool_template_id ?? null,
        has_pool: !!poolMap[c.id],
        pool: poolMap[c.id]?.pool ?? null,
        pool_generation: poolMap[c.id]?.generation ?? 0,
      })))
      setTypes(ty || [])
      setTemplates(templateData || [])
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setForm(blankForm)
    setEditId(null)
    setModal('create')
  }

  function openEdit(c: Challenge) {
    setForm({
      title: c.title, entry_fee: String(c.entry_fee), prize_pool: String(c.prize_pool),
      challenge_type_id: '', start_date: c.start_date?.slice(0, 16) || '',
      end_date: c.end_date?.slice(0, 16) || '',
      personal_window_days: String(c.personal_window_days),
      min_target: String(c.min_target), target_unit: c.target_unit,
      sort_order: String(c.sort_order), total_slots: String(c.total_slots),
      rules: Array.isArray(c.rules) ? c.rules.join('\n') : '',
      cashback_tiers: c.cashback_tiers ? JSON.stringify(c.cashback_tiers, null, 2) : '',
      video_url: c.video_url || '',
      prize_pool_template_id: c.prize_pool_template_id || '',
    })
    setEditId(c.id)
    setModal('edit')
  }

  async function handleSave() {
    if (!form.title || !form.entry_fee) { toast('Fill required fields', 'error'); return }
    setSaving(true)
    try {
      let cashback = []
      let rules: string[] = []
      try { cashback = JSON.parse(form.cashback_tiers) } catch { }
      try { rules = form.rules.split('\n').filter(Boolean) } catch { }

      const payload: Record<string, unknown> = {
        title: form.title,
        entry_fee: Number(form.entry_fee),
        prize_pool: Number(form.prize_pool),
        start_date: form.start_date,
        end_date: form.end_date,
        personal_window_days: Number(form.personal_window_days),
        min_target: Number(form.min_target),
        target_unit: form.target_unit,
        sort_order: Number(form.sort_order),
        total_slots: Number(form.total_slots),
        cashback_tiers: cashback,
        rules,
        video_url: form.video_url || null,
        prize_pool_template_id: form.prize_pool_template_id || null,
        ...(form.challenge_type_id ? { challenge_type_id: form.challenge_type_id } : {}),
      }

      if (editId) {
        await adminDb('update', { table: 'challenges', data: payload, filters: { id: editId } })
        toast('Challenge updated')
      } else {
        const res = await adminDb('insert', { table: 'challenges', data: payload })

        if (form.prize_pool_template_id) {
          const [{ data: tpl }, { data: newChallenge }] = await Promise.all([
            supabase.from('prize_pool_templates').select('prizes').eq('id', form.prize_pool_template_id).single(),
            res.data?.[0]?.id
              ? Promise.resolve({ data: { id: res.data[0].id } })
              : supabase.from('challenges').select('id').eq('title', form.title).order('created_at', { ascending: false }).limit(1).single(),
          ])
          await adminDb('insert', {
            table: 'challenge_prize_pools',
            data: {
              challenge_id: newChallenge!.id,
              template_id: form.prize_pool_template_id,
              pool: tpl?.prizes ?? [],
              generation: 1,
              is_active: true,
            },
          })
          if (!tpl?.prizes?.length) {
            toast('Challenge created but template has no prizes defined. Update via Set Pool.', 'error')
          } else {
            toast('Challenge created')
          }
        } else {
          toast('Challenge created')
        }
      }
      setModal(null)
      load()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(c: Challenge) {
    try {
      await adminDb('update', { table: 'challenges', data: { is_active: !c.is_active }, filters: { id: c.id } })
      toast(`Challenge ${c.is_active ? 'deactivated' : 'activated'}`)
      load()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  function openPoolModal(c: Challenge) {
    setPoolModal(c)
    setPoolForm({ prizes: c.pool ? c.pool.join(', ') : '', template_id: '' })
  }

  async function handlePoolSave() {
    if (!poolModal) return
    setPoolSaving(true)
    try {
      const pool = poolForm.prizes
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => !isNaN(n) && n > 0)
      if (poolModal.has_pool) {
        await adminDb('update', {
          table: 'challenge_prize_pools',
          data: { pool, generation: poolModal.pool_generation + 1, is_active: true },
          filters: { challenge_id: poolModal.id },
        })
      } else {
        await adminDb('insert', {
          table: 'challenge_prize_pools',
          data: {
            challenge_id: poolModal.id,
            template_id: poolForm.template_id || null,
            pool,
            generation: 1,
            is_active: true,
          },
        })
      }
      toast('Pool saved')
      setPoolModal(null)
      load()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setPoolSaving(false)
    }
  }

  const f = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Challenges</div>
          <div className="page-subtitle">Manage fitness challenges</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCsv(
            challenges.map(c => ({
              id: c.id, title: c.title, challenge_type: c.challenge_type,
              entry_fee: c.entry_fee, prize_pool: c.prize_pool,
              is_active: c.is_active, total_slots: c.total_slots,
              participant_count: c.participant_count,
              personal_window_days: c.personal_window_days,
              min_target: c.min_target, target_unit: c.target_unit,
              start_date: c.start_date, end_date: c.end_date,
            })),
            'zelth_challenges'
          )}><Download size={13} /> Export CSV</button>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> New Challenge</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">Loading...</div> : challenges.length === 0 ? (
          <div className="empty"><div className="empty-icon">🏆</div><div className="empty-text">No challenges yet</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Entry Fee</th>
                  <th>Prize Pool</th>
                  <th>Pool</th>
                  <th>Participants</th>
                  <th>Total Slots</th>
                  <th>Window</th>
                  <th>Status</th>
                  <th>Ends</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {challenges.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.title}</td>
                    <td><span className="badge badge-pending">{c.challenge_type}</span></td>
                    <td style={{ color: 'var(--orange)', fontWeight: 600 }}>₹{c.entry_fee}</td>
                    <td style={{ color: 'var(--green)' }}>₹{c.prize_pool.toLocaleString('en-IN')}</td>
                    <td>
                      {c.has_pool && c.pool && c.pool.length > 0
                        ? <span className="badge badge-verified" title={c.pool.map(p => `₹${p.toLocaleString('en-IN')}`).join(', ')}>₹{Math.min(...c.pool).toLocaleString('en-IN')} – ₹{Math.max(...c.pool).toLocaleString('en-IN')}</span>
                        : <span className="badge badge-pending">⚠️ No Pool</span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 600 }}>{c.participant_count}</span>
                      <span style={{ color: 'var(--text3)', fontSize: 11 }}>/{c.total_slots}</span>
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{c.total_slots}</td>
                    <td style={{ color: 'var(--text2)' }}>{c.personal_window_days}d</td>
                    <td>
                      <span className={`badge ${c.is_active ? 'badge-verified' : 'badge-rejected'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{new Date(c.end_date).toLocaleDateString('en-IN')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}><Edit2 size={12} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(c)}>
                          {c.is_active ? <ToggleRight size={14} color="var(--green)" /> : <ToggleLeft size={14} />}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openPoolModal(c)} title="Set Pool" style={{ fontSize: 12 }}>₹</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === 'create' ? '➕ New Challenge' : '✏️ Edit Challenge'}</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="label">Title *</label>
                <input className="input" value={form.title} onChange={e => f('title', e.target.value)} placeholder="Morning Rush 🌅" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Entry Fee (₹) *</label>
                  <input className="input" type="number" value={form.entry_fee} onChange={e => f('entry_fee', e.target.value)} placeholder="79" />
                </div>
                <div>
                  <label className="label">Prize Pool (₹)</label>
                  <input className="input" type="number" value={form.prize_pool} onChange={e => f('prize_pool', e.target.value)} placeholder="5000" />
                </div>
              </div>
              {modal === 'create' && (
                <>
                  <div>
                    <label className="label">Challenge Type *</label>
                    <select className="input filter-select" style={{ width: '100%' }} value={form.challenge_type_id} onChange={e => f('challenge_type_id', e.target.value)}>
                      <option value="">Select type</option>
                      {types.map(t => <option key={t.id} value={t.id}>{t.display_name || t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Prize Pool Template (optional)</label>
                    <select className="input filter-select" style={{ width: '100%' }} value={form.prize_pool_template_id} onChange={e => f('prize_pool_template_id', e.target.value)}>
                      <option value="">No template</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.description ? ' — ' + t.description : ''}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Start Date</label>
                  <input className="input" type="datetime-local" value={form.start_date} onChange={e => f('start_date', e.target.value)} />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input className="input" type="datetime-local" value={form.end_date} onChange={e => f('end_date', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Window Days</label>
                  <input className="input" type="number" value={form.personal_window_days} onChange={e => f('personal_window_days', e.target.value)} />
                </div>
                <div>
                  <label className="label">Min Target</label>
                  <input className="input" type="number" value={form.min_target} onChange={e => f('min_target', e.target.value)} />
                </div>
                <div>
                  <label className="label">Target Unit</label>
                  <select className="input filter-select" style={{ width: '100%' }} value={form.target_unit} onChange={e => f('target_unit', e.target.value)}>
                    <option value="meters">meters</option>
                    <option value="reps">reps</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Total Slots</label>
                  <input className="input" type="number" value={form.total_slots} onChange={e => f('total_slots', e.target.value)} />
                </div>
                <div>
                  <label className="label">Sort Order</label>
                  <input className="input" type="number" value={form.sort_order} onChange={e => f('sort_order', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Rules (one per line)</label>
                <textarea className="input" rows={4} value={form.rules} onChange={e => f('rules', e.target.value)} placeholder="Complete your run using Strava&#10;Minimum 2km required" style={{ resize: 'vertical' }} />
              </div>
              <div>
                <label className="label">Video URL (optional)</label>
                <input className="input" value={form.video_url} onChange={e => f('video_url', e.target.value)} placeholder="https://res.cloudinary.com/..." />
              </div>
              <div>
                <label className="label">Cashback Tiers (JSON)</label>
                <textarea className="input" rows={3} value={form.cashback_tiers} onChange={e => f('cashback_tiers', e.target.value)} style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : modal === 'create' ? 'Create Challenge' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {poolModal && (
        <div className="modal-overlay" onClick={() => setPoolModal(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">💰 Set Prize Pool — {poolModal.title}</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {poolModal.has_pool && poolModal.pool && (
                <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 12 }}>
                  <div style={{ color: 'var(--text3)', marginBottom: 4 }}>Current pool (Gen {poolModal.pool_generation})</div>
                  <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                    {poolModal.pool.map(p => `₹${p.toLocaleString('en-IN')}`).join(', ')}
                  </div>
                </div>
              )}
              <div>
                <label className="label">Fill from Template</label>
                <select
                  className="input filter-select"
                  style={{ width: '100%' }}
                  value={poolForm.template_id}
                  onChange={e => {
                    const tId = e.target.value
                    const tpl = templates.find(t => t.id === tId)
                    setPoolForm(prev => ({
                      ...prev,
                      template_id: tId,
                      prizes: tpl && tpl.prizes.length > 0 ? tpl.prizes.join(', ') : prev.prizes,
                    }))
                  }}
                >
                  <option value="">Select template to auto-fill</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Prize Amounts (₹, comma-separated)</label>
                <textarea
                  className="input"
                  rows={4}
                  value={poolForm.prizes}
                  onChange={e => setPoolForm(prev => ({ ...prev, prizes: e.target.value }))}
                  placeholder="5000, 3000, 2000, 1000, 500"
                  style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setPoolModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handlePoolSave} disabled={poolSaving}>
                {poolSaving ? 'Saving...' : poolModal.has_pool ? 'Update Pool' : 'Create Pool'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
