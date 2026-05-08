import { useState } from 'react'
import { supabase, callEdge, SERVICE_SECRET } from '../lib/supabase'
import { toast } from '../components/Toast'
import { Send, Users } from 'lucide-react'

export function Notify() {
  const [target, setTarget] = useState<'single' | 'all'>('single')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [logs, setLogs] = useState<any[]>([])

  async function handleSend() {
    if (!title || !body) { toast('Title and body required', 'error'); return }
    setSending(true)
    try {
      if (target === 'single') {
        if (!phone) { toast('Enter phone number', 'error'); setSending(false); return }
        const { data: user } = await supabase.from('users').select('id').eq('phone', phone).single()
        if (!user) { toast('User not found', 'error'); setSending(false); return }
        await callEdge('send-notification', {
          service_secret: SERVICE_SECRET,
          user_id: user.id,
          title,
          body,
        })
        toast('Notification sent!')
        setLogs(prev => [{ time: new Date().toLocaleTimeString(), target: phone, title, status: 'sent' }, ...prev])
      } else {
        // All users
        const { data: tokens } = await supabase.from('user_fcm_tokens').select('user_id')
        const userIds = (tokens || []).map((t: any) => t.user_id)
        let success = 0, fail = 0
        for (const userId of userIds) {
          try {
            await callEdge('send-notification', {
              service_secret: SERVICE_SECRET,
              user_id: userId,
              title,
              body,
            })
            success++
          } catch { fail++ }
          await new Promise(r => setTimeout(r, 100))
        }
        toast(`Sent to ${success} users, ${fail} failed`)
        setLogs(prev => [{ time: new Date().toLocaleTimeString(), target: `All users (${success}/${userIds.length})`, title, status: success > 0 ? 'sent' : 'failed' }, ...prev])
      }
      setTitle('')
      setBody('')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Send Notification</div>
          <div className="page-subtitle">Push notifications to users</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>🔔 Compose Notification</div>

            {/* Target */}
            <div style={{ marginBottom: 16 }}>
              <label className="label">Target</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`btn ${target === 'single' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTarget('single')}>
                  Single User
                </button>
                <button className={`btn ${target === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTarget('all')}>
                  <Users size={13} /> All Users
                </button>
              </div>
            </div>

            {target === 'single' && (
              <div style={{ marginBottom: 12 }}>
                <label className="label">Phone Number</label>
                <input className="input" placeholder="9876543210" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            )}

            {target === 'all' && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>⚠️ Warning</div>
                <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>This will send a push notification to ALL users with FCM tokens. Use sparingly.</div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label className="label">Title *</label>
              <input className="input" placeholder="🎉 Results are out!" value={title} onChange={e => setTitle(e.target.value)} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Body *</label>
              <textarea className="input" rows={4} placeholder="Your run has been verified! Check your wallet for winnings." value={body} onChange={e => setBody(e.target.value)} style={{ resize: 'vertical' }} />
            </div>

            {/* Preview */}
            {(title || body) && (
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>PREVIEW</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#000', fontSize: 16, flexShrink: 0 }}>Z</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{title || 'Title...'}</div>
                    <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 2 }}>{body || 'Body...'}</div>
                  </div>
                </div>
              </div>
            )}

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }} onClick={handleSend} disabled={sending}>
              <Send size={14} /> {sending ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </div>

        {/* Logs */}
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 16 }}>📋 Recent Sends</div>
          {logs.length === 0 ? (
            <div className="empty" style={{ padding: 40 }}>
              <div className="empty-icon" style={{ fontSize: 28 }}>📭</div>
              <div className="empty-text">No notifications sent yet</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {logs.map((log, i) => (
                <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12, borderLeft: `3px solid ${log.status === 'sent' ? 'var(--green)' : 'var(--red)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{log.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{log.time}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>→ {log.target}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
