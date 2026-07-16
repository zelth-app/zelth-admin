import { useEffect, useState } from 'react'
import { adminDb } from '../lib/supabase'
import { toast } from '../components/Toast'
import { exportCsv } from '../lib/exportCsv'
import { RefreshCw, Download, Plus, Edit2 } from 'lucide-react'

interface PrizeTemplate {
  id: string
  name: string
  description: string | null
  prizes: number[]
  is_active: boolean
  created_at: string
}

const blankForm = { name: '', description: '', prizes: '', is_active: true }

export function PrizePoolTemplates() {
  const [rows, setRows] = useState<PrizeTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState<{ name: string; description: string; prizes: string; is_active: boolean }>(blankForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await adminDb('select', {
        table: 'prize_pool_templates',
        columns: '*',
        order: { column: 'created_at', ascending: true },
      })
      setRows(data || [])
    } catch (e: any) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  async function handleSave() {
    if (!form.name) { toast('Name is required', 'error'); return }
    setSaving(true)
    try {
      const prizes = form.prizes
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => !isNaN(n) && n > 0)
      const payload = { name: form.name, description: form.description || null, prizes, is_active: form.is_active }
      if (editId) {
        await adminDb('update', { table: 'prize_pool_templates', data: payload, filters: { id: editId } })
        toast('Template updated')
      } else {
        await adminDb('insert', { table: 'prize_pool_templates', data: payload })
        toast('Template created')
      }
      setModal(null)
      load()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  function openEdit(r: PrizeTemplate) {
    setForm({
      name: r.name,
      description: r.description || '',
      prizes: Array.isArray(r.prizes) ? r.prizes.join(', ') : '',
      is_active: r.is_active,
    })
    setEditId(r.id)
    setModal('edit')
  }

  const f = (k: keyof typeof blankForm, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Prize Templates</div>
          <div className="page-subtitle">Manage prize pool templates</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCsv(rows as unknown as Record<string, unknown>[], 'zelth_prize_templates')}><Download size={13} /> Export</button>
          <button className="btn btn-primary" onClick={() => { setForm(blankForm); setEditId(null); setModal('create') }}><Plus size={14} /> New Template</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">Loading...</div> : rows.length === 0 ? (
          <div className="empty"><div className="empty-icon">🏆</div><div className="empty-text">No templates yet</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Description</th><th>Prizes (₹)</th><th>Active</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const prizes = Array.isArray(r.prizes) ? r.prizes : []
                  const display = prizes.length > 5
                    ? prizes.slice(0, 5).map(p => `₹${p.toLocaleString('en-IN')}`).join(', ') + '...'
                    : prizes.map(p => `₹${p.toLocaleString('en-IN')}`).join(', ')
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td style={{ color: 'var(--text2)' }}>{r.description || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>{display || '—'}</td>
                      <td>
                        <span className={`badge ${r.is_active ? 'badge-verified' : 'badge-rejected'}`}>
                          {r.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}><Edit2 size={12} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === 'create' ? '➕ New Prize Template' : '✏️ Edit Prize Template'}</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="label">Name *</label>
                <input className="input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="Standard 5K Template" />
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <input className="input" value={form.description} onChange={e => f('description', e.target.value)} placeholder="For 5km running challenges" />
              </div>
              <div>
                <label className="label">Prizes (₹)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.prizes}
                  onChange={e => f('prizes', e.target.value)}
                  placeholder="5000, 3000, 2000, 1000, 500, 500, 300, 200, 100"
                  style={{ resize: 'vertical' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Enter prize amounts in ₹, comma-separated, highest to lowest
                </div>
              </div>
              <div>
                <label className="label">Active</label>
                <select
                  className="input filter-select"
                  style={{ width: '100%' }}
                  value={form.is_active ? 'true' : 'false'}
                  onChange={e => f('is_active', e.target.value === 'true')}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : modal === 'create' ? 'Create Template' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
