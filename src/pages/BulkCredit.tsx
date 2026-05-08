import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { callEdge, SERVICE_SECRET } from '../lib/supabase'
import { toast } from '../components/Toast'
import { exportCsv } from '../lib/exportCsv'
import { Upload, Download, CheckCircle, XCircle, Clock } from 'lucide-react'

interface CsvRow {
  user_id: string
  participant_id: string
  challenge_id: string
  amount: string
  reward_type: string
  win_code?: string
  note?: string
}

interface Result {
  row: CsvRow
  status: 'success' | 'error' | 'pending'
  message?: string
}

const TEMPLATE = `user_id,participant_id,challenge_id,amount,reward_type,win_code,note
USER_UUID,PARTICIPANT_UUID,CHALLENGE_UUID,500,prize,P1,Morning Rush winner
USER_UUID2,PARTICIPANT_UUID2,CHALLENGE_UUID2,100,cashback,C1,Cashback for 3km run`

export function BulkCredit() {
  const [rows, setRows] = useState<CsvRow[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResults([])
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setRows(result.data)
        toast(`${result.data.length} rows loaded`, 'info')
      },
      error: (err) => toast(err.message, 'error'),
    })
  }

  async function handleProcess() {
    if (!rows.length) { toast('Upload a CSV first', 'error'); return }
    if (!SERVICE_SECRET) { toast('SERVICE_SECRET not configured', 'error'); return }

    setProcessing(true)
    setProgress(0)
    const res: Result[] = rows.map(r => ({ row: r, status: 'pending' }))
    setResults([...res])

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        if (!row.user_id || !row.participant_id || !row.challenge_id || !row.amount) {
          throw new Error('Missing required fields')
        }
        await callEdge('credit-wallet', {
          service_secret: SERVICE_SECRET,
          user_id: row.user_id,
          participant_id: row.participant_id,
          challenge_id: row.challenge_id,
          amount: Number(row.amount),
          reward_type: row.reward_type || 'prize',
          win_code: row.win_code || undefined,
          note: row.note || undefined,
        })
        res[i] = { row, status: 'success', message: `✓ ₹${row.amount} credited` }
      } catch (e: any) {
        res[i] = { row, status: 'error', message: e.message }
      }
      setResults([...res])
      setProgress(Math.round(((i + 1) / rows.length) * 100))
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200))
    }

    setProcessing(false)
    const successCount = res.filter(r => r.status === 'success').length
    const errorCount = res.filter(r => r.status === 'error').length
    toast(`Done! ${successCount} credited, ${errorCount} failed`, successCount > 0 ? 'success' : 'error')
    const resultRows = res.map((r, i) => ({
      row_number: i + 1,
      status: r.status,
      message: r.message || '',
      processed_at: new Date().toISOString(),
      ...r.row,
    }))
    exportCsv(resultRows as Record<string, unknown>[], 'zelth_bulk_credit_results')
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'zelth_bulk_credit_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const successCount = results.filter(r => r.status === 'success').length
  const errorCount = results.filter(r => r.status === 'error').length
  const pendingCount = results.filter(r => r.status === 'pending').length

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Bulk Credit</div>
          <div className="page-subtitle">Upload a CSV to credit multiple users at once</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}><Download size={13} /> Download Template</button>
      </div>

      {/* Upload Area */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📤 Upload CSV</div>
        <div
          style={{
            border: '2px dashed var(--border2)', borderRadius: 8, padding: '32px 20px',
            textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s',
          }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) { const dt = new DataTransfer(); dt.items.add(file); fileRef.current!.files = dt.files; handleFile({ target: fileRef.current } as any) }
          }}
        >
          <Upload size={32} color="var(--text3)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Drop CSV here or click to browse</div>
          <div style={{ color: 'var(--text3)', fontSize: 12 }}>Columns: user_id, participant_id, challenge_id, amount, reward_type, win_code (opt), note (opt)</div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
        </div>

        {rows.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 12 }}>
              ✓ {rows.length} rows loaded
            </div>

            {/* Preview */}
            <div className="table-wrap" style={{ maxHeight: 200, overflow: 'auto', marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>User ID</th><th>Participant ID</th><th>Amount</th><th>Type</th><th>Win Code</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text3)' }}>{i + 1}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{r.user_id?.slice(0, 16)}...</td>
                      <td className="mono" style={{ fontSize: 11 }}>{r.participant_id?.slice(0, 16)}...</td>
                      <td style={{ fontWeight: 600, color: 'var(--orange)' }}>₹{r.amount}</td>
                      <td><span className={`badge badge-${r.reward_type === 'prize' ? 'verified' : 'pending'}`}>{r.reward_type}</span></td>
                      <td className="mono">{r.win_code || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 10 && <div style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 12 }}>...and {rows.length - 10} more rows</div>}

            <button className="btn btn-primary" onClick={handleProcess} disabled={processing} style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
              {processing ? `Processing... ${progress}%` : `💰 Credit ${rows.length} Users`}
            </button>

            {processing && (
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'var(--orange)', transition: 'width 0.2s' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, textAlign: 'center' }}>{progress}% complete</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>Results</span>
            {successCount > 0 && <span style={{ color: 'var(--green)', fontSize: 12 }}>✓ {successCount} success</span>}
            {errorCount > 0 && <span style={{ color: 'var(--red)', fontSize: 12 }}>✗ {errorCount} failed</span>}
            {pendingCount > 0 && <span style={{ color: 'var(--text3)', fontSize: 12 }}>⏳ {pendingCount} pending</span>}
            {results.length > 0 && !processing && (
              <button className="btn btn-ghost btn-sm" onClick={() => exportCsv(
                results.map((r, i) => ({
                  row_number: i + 1,
                  status: r.status,
                  message: r.message || '',
                  processed_at: new Date().toISOString(),
                  ...r.row,
                })) as Record<string, unknown>[],
                'zelth_results'
              )}>
                <Download size={13} /> Download Results CSV
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>User ID</th><th>Amount</th><th>Status</th><th>Message</th></tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text3)' }}>{i + 1}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.row.user_id?.slice(0, 20)}...</td>
                    <td style={{ fontWeight: 600 }}>₹{r.row.amount}</td>
                    <td>
                      {r.status === 'success' && <CheckCircle size={14} color="var(--green)" />}
                      {r.status === 'error' && <XCircle size={14} color="var(--red)" />}
                      {r.status === 'pending' && <Clock size={14} color="var(--text3)" />}
                    </td>
                    <td style={{ fontSize: 12, color: r.status === 'error' ? 'var(--red)' : r.status === 'success' ? 'var(--green)' : 'var(--text3)' }}>
                      {r.message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
