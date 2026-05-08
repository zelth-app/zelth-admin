import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../components/Toast'
import { exportCsv } from '../lib/exportCsv'
import { RefreshCw, Download, Plus, Edit2 } from 'lucide-react'

interface ChallengeType {
  id: string
  name: string
  display_name: string
  tracking_method: string
  metric_unit: string
  metric_label: string
  created_at: string
}

const blankForm = {
  name: '', display_name: '', tracking_method: 'strava',
  metric_unit: 'meters', metric_label: 'Distance',
}

export function ChallengeTypes() {
  const [rows, setRows] = useState<ChallengeType[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState(blankForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('challenge_types').select('*').order('created_at')
      if (error) throw error
      setRows(data || [])
    } catch (e: any) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  async function handleSave() {
    if (!form.name || !form.display_name) { toast('Fill required fields', 'error'); return }
    setSaving(true)
    try {
      if (editId) {
        const { error } = await supabase.from('challenge_types').update(form).eq('id', editId)
        if (error) throw error
        toast('Challenge type updated')
      } else {
        const { error } = await supabase.from('challenge_types').insert(form)
        if (error) throw error
        toast('Challenge type created')
      }
      setModal(null)
      load()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  function openEdit(r: ChallengeType) {
    setForm({ name: r.name, display_name: r.display_name, tracking_method: r.tracking_method, metric_unit: r.metric_unit, metric_label: r.metric_label })
    setEditId(r.id)
    setModal('edit')
  }

  const f = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Challenge Types</div>
          <div className="page-subtitle">Manage challenge categories</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCsv(rows as unknown as Record<string, unknown>[], 'zelth_challenge_types')}><Download size={13} /> Export</button>
          <button className="btn btn-primary" onClick={() => { setForm(blankForm); setEditId(null); setModal('create') }}><Plus size={14} /> New Type</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">Loading...</div> : rows.length === 0 ? (
          <div className="empty"><div className="empty-icon">🏷️</div><div className="empty-text">No challenge types</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Display Name</th><th>Tracking</th><th>Metric Unit</th><th>Metric Label</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="mono">{r.name}</td>
                    <td style={{ fontWeight: 600 }}>{r.display_name}</td>
                    <td><span className="badge badge-pending">{r.tracking_method}</span></td>
                    <td style={{ color: 'var(--text2)' }}>{r.metric_unit}</td>
                    <td style={{ color: 'var(--text2)' }}>{r.metric_label}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}><Edit2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === 'create' ? '➕ New Challenge Type' : '✏️ Edit Challenge Type'}</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="label">Name (internal) *</label>
                <input className="input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="running" />
              </div>
              <div>
                <label className="label">Display Name *</label>
                <input className="input" value={form.display_name} onChange={e => f('display_name', e.target.value)} placeholder="🏃 Running" />
              </div>
              <div>
                <label className="label">Tracking Method</label>
                <select className="input filter-select" style={{ width: '100%' }} value={form.tracking_method} onChange={e => f('tracking_method', e.target.value)}>
                  <option value="strava">strava</option>
                  <option value="manual">manual</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Metric Unit</label>
                  <input className="input" value={form.metric_unit} onChange={e => f('metric_unit', e.target.value)} placeholder="meters" />
                </div>
                <div>
                  <label className="label">Metric Label</label>
                  <input className="input" value={form.metric_label} onChange={e => f('metric_label', e.target.value)} placeholder="Distance" />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : modal === 'create' ? 'Create Type' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
