import { useRef, useState } from "react";
import Papa from "papaparse";
import { callEdge, SERVICE_SECRET, adminDb } from "../lib/supabase";
import { toast } from "../components/Toast";
import { exportCsv } from "../lib/exportCsv";
import {
  Upload,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react";

interface CsvRow {
  submission_id: string;
  participant_id: string;
  user_id: string;
  challenge_id: string;
  amount?: string;
  reward_type?: string;
  win_code?: string;
  note?: string;
  action: "verify" | "reject";
  rejection_reason?: string;
  metric_achieved?: string;
}

interface Result {
  row: CsvRow;
  status: "success" | "error" | "pending";
  message?: string;
}

const VERIFY_TEMPLATE = `INSTRUCTIONS,READ ONLY columns (do not edit ref_ columns),READ ONLY,READ ONLY,READ ONLY,READ ONLY,READ ONLY,READ ONLY,READ ONLY,READ ONLY,READ ONLY,READ ONLY,READ ONLY,DO NOT EDIT,DO NOT EDIT,DO NOT EDIT,DO NOT EDIT,FILL THIS,FILL THIS,FILL THIS,FILL THIS,FILL THIS,OPTIONAL,FILL IF REJECTING
ref_user_name,ref_phone,ref_challenge,ref_attempt_number,ref_entry_fee,ref_strava_url,ref_submitted_at,ref_win_streak,ref_prize_count,ref_cashback_count,ref_total_prize_won,ref_total_cashback_won,ref_last_win_code,submission_id,participant_id,user_id,challenge_id,action,amount,reward_type,win_code,metric_achieved,note,rejection_reason
John Doe,9876543210,Morning Rush,1,79,https://strava.app.link/xxx,2026-05-01,P1,1,0,500,0,P1,SUB_UUID,PART_UUID,USER_UUID,CHAL_UUID,verify,500,prize,P2,5.2,Winner,
Jane Doe,9876543211,Morning Rush,2,79,https://strava.app.link/yyy,2026-05-01,,,0,0,0,,SUB_UUID2,PART_UUID2,USER_UUID2,CHAL_UUID2,reject,,,,,Run paused multiple times`;

export function BulkVerify() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pendingSubs, setPendingSubs] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadPendingSubmissions() {
    setLoadingPending(true);
    try {
      const { data } = await adminDb("select", {
        table: "activity_submissions",
        columns:
          "id, strava_url, submitted_at, users!inner(id, name, phone), challenge_participants!inner(id, challenge_id, attempt_number, challenges!inner(title, entry_fee))",
        filters: { status: "submitted" },
        order: { column: "submitted_at", ascending: true },
      });

      const subs: any[] = data || [];

      const userIds = [
        ...new Set(subs.map((s: any) => s.users?.id).filter(Boolean)),
      ];

      let winMap: Record<
        string,
        {
          win_streak: string;
          prize_count: number;
          cashback_count: number;
          total_prize_won: number;
          total_cashback_won: number;
          last_win_code: string;
        }
      > = {};

      if (userIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < userIds.length; i += 50) {
          chunks.push(userIds.slice(i, i + 50));
        }
        const rewardResults = await Promise.all(
          chunks.map((chunk) =>
            adminDb("select", {
              table: "rewards",
              columns: "user_id, win_code, reward_type, amount, created_at",
              in: { column: "user_id", values: chunk },
              order: { column: "created_at", ascending: true },
            }),
          ),
        );
        const rewards = rewardResults.flatMap((r) => r.data || []);

        for (const userId of userIds) {
          const userRewards = (rewards || []).filter(
            (r: any) => r.user_id === userId,
          );
          winMap[userId] = {
            win_streak: userRewards
              .map((r: any) => r.win_code)
              .filter(Boolean)
              .join(","),
            prize_count: userRewards.filter(
              (r: any) => r.reward_type === "prize",
            ).length,
            cashback_count: userRewards.filter(
              (r: any) => r.reward_type === "cashback",
            ).length,
            total_prize_won: userRewards
              .filter((r: any) => r.reward_type === "prize")
              .reduce((s: number, r: any) => s + Number(r.amount), 0),
            total_cashback_won: userRewards
              .filter((r: any) => r.reward_type === "cashback")
              .reduce((s: number, r: any) => s + Number(r.amount), 0),
            last_win_code:
              userRewards.filter((r: any) => r.win_code).slice(-1)[0]
                ?.win_code || "",
          };
        }
      }

      const enriched = subs.map((s: any) => ({
        ...s,
        _win: winMap[s.users?.id] || {
          win_streak: "",
          prize_count: 0,
          cashback_count: 0,
          total_prize_won: 0,
          total_cashback_won: 0,
          last_win_code: "",
        },
      }));

      setPendingSubs(enriched);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoadingPending(false);
    }
  }

  const filteredPendingSubs = pendingSubs.filter((s) => {
    const matchFrom =
      !dateFrom || new Date(s.submitted_at) >= new Date(dateFrom);
    const matchTo = !dateTo || new Date(s.submitted_at) <= new Date(dateTo);
    return matchFrom && matchTo;
  });

  function downloadTemplate() {
    const blob = new Blob([VERIFY_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zelth_bulk_verify_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPendingCSV() {
    if (!filteredPendingSubs.length) {
      toast("Load pending submissions first", "error");
      return;
    }
    const csvRows = filteredPendingSubs.map((s: any) => ({
      ref_user_name: s.users?.name,
      ref_phone: s.users?.phone,
      ref_challenge: s.challenge_participants?.challenges?.title,
      ref_attempt_number: s.challenge_participants?.attempt_number || 1,
      ref_entry_fee: s.challenge_participants?.challenges?.entry_fee,
      ref_strava_url: s.strava_url,
      ref_submitted_at: s.submitted_at,
      ref_win_streak: s._win?.win_streak || "—",
      ref_prize_count: s._win?.prize_count || 0,
      ref_cashback_count: s._win?.cashback_count || 0,
      ref_total_prize_won: s._win?.total_prize_won || 0,
      ref_total_cashback_won: s._win?.total_cashback_won || 0,
      ref_last_win_code: s._win?.last_win_code || "—",
      submission_id: s.id,
      participant_id: s.challenge_participants?.id,
      user_id: s.users?.id,
      challenge_id: s.challenge_participants?.challenge_id,
      action: "verify",
      amount: "",
      reward_type: "prize",
      win_code: "",
      metric_achieved: "",
      note: "",
      rejection_reason: "",
    }));
    const csv = Papa.unparse(csvRows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zelth_pending_submissions.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("CSV downloaded — fill in amounts and upload back");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResults([]);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      beforeFirstChunk: (chunk) => {
        const lines = chunk.split("\n");
        lines.splice(0, 1); // remove instructions row
        return lines.join("\n");
      },
      complete: (result) => {
        setRows(result.data);
        toast(`${result.data.length} rows loaded`, "info");
      },
      error: (err) => toast(err.message, "error"),
    });
  }

  async function handleProcess() {
    if (!rows.length) {
      toast("Upload a CSV first", "error");
      return;
    }
    setProcessing(true);
    setProgress(0);

    const verifyWithoutAmount = rows.filter(
      (r) => r.action === "verify" && (!r.amount || Number(r.amount) <= 0),
    );
    if (verifyWithoutAmount.length > 0) {
      const confirm = window.confirm(
        `⚠️ ${verifyWithoutAmount.length} verify rows have no amount — wallet will NOT be credited for these. Continue anyway?`,
      );
      if (!confirm) {
        setProcessing(false);
        return;
      }
    }

    const submissionIds = rows.map((r) => r.submission_id).filter(Boolean);
    const idChunks: string[][] = [];
    for (let i = 0; i < submissionIds.length; i += 50) {
      idChunks.push(submissionIds.slice(i, i + 50));
    }
    const verifiedResults = await Promise.all(
      idChunks.map((chunk) =>
        adminDb("select", {
          table: "activity_submissions",
          columns: "id, status",
          in: { column: "id", values: chunk },
          filters: { status: "verified" },
        }),
      ),
    );
    const existingVerified = verifiedResults.flatMap((r) => r.data || []);

    if (existingVerified.length > 0) {
      const confirm = window.confirm(
        `⚠️ ${existingVerified.length} submissions are already verified — crediting again may cause duplicates. Continue?`,
      );
      if (!confirm) {
        setProcessing(false);
        return;
      }
    }

    const res: Result[] = rows.map((r) => ({ row: r, status: "pending" }));
    setResults([...res]);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.submission_id || !row.action)
          throw new Error("Missing submission_id or action");

        const baseUpdate: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (row.metric_achieved && Number(row.metric_achieved) > 0) {
          baseUpdate.metric_achieved = Number(row.metric_achieved);
        }

        if (row.action === "verify") {
          await adminDb("update", {
            table: "activity_submissions",
            data: {
              ...baseUpdate,
              status: "verified",
              verified_at: new Date().toISOString(),
            },
            filters: { id: row.submission_id },
          });

          if (row.amount && Number(row.amount) > 0) {
            if (!row.participant_id || !row.user_id || !row.challenge_id)
              throw new Error(
                "Missing participant_id, user_id or challenge_id for credit",
              );
            await callEdge("credit-wallet", {
              service_secret: SERVICE_SECRET,
              user_id: row.user_id,
              participant_id: row.participant_id,
              challenge_id: row.challenge_id,
              amount: Number(row.amount),
              reward_type: row.reward_type || "prize",
              win_code: row.win_code || undefined,
              note: row.note || undefined,
            });
          }
          res[i] = {
            row,
            status: "success",
            message: `✓ Verified${row.amount ? ` + ₹${row.amount} credited` : ""}`,
          };
        } else if (row.action === "reject") {
          if (!row.rejection_reason)
            throw new Error("rejection_reason required for reject action");
          await adminDb("update", {
            table: "activity_submissions",
            data: {
              ...baseUpdate,
              status: "rejected",
              rejection_reason: row.rejection_reason,
            },
            filters: { id: row.submission_id },
          });
          res[i] = { row, status: "success", message: `✓ Rejected` };
        } else {
          throw new Error(
            `Invalid action: ${row.action}. Use 'verify' or 'reject'`,
          );
        }
      } catch (e: any) {
        res[i] = { row, status: "error", message: e.message };
      }
      setResults([...res]);
      setProgress(Math.round(((i + 1) / rows.length) * 100));
      await new Promise((r) => setTimeout(r, 300));
    }

    setProcessing(false);
    const successCount = res.filter((r) => r.status === "success").length;
    const errorCount = res.filter((r) => r.status === "error").length;
    toast(
      `Done! ${successCount} processed, ${errorCount} failed`,
      successCount > 0 ? "success" : "error",
    );
    const resultRows = res.map((r, i) => ({
      row_number: i + 1,
      status: r.status,
      message: r.message || "",
      processed_at: new Date().toISOString(),
      ...r.row,
    }));
    exportCsv(
      resultRows as Record<string, unknown>[],
      "zelth_bulk_verify_results",
    );
  }

  const verifyCount = rows.filter((r) => r.action === "verify").length;
  const rejectCount = rows.filter((r) => r.action === "reject").length;
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Bulk Verify / Reject</div>
          <div className="page-subtitle">
            Process multiple submissions at once via CSV
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
            <Download size={13} /> Template
          </button>
        </div>
      </div>

      {/* Step 1 - Get pending submissions */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>
          Step 1 — Get Pending Submissions
        </div>
        <p style={{ color: "var(--text2)", fontSize: 13, marginBottom: 12 }}>
          Download all pending submissions as CSV, fill in amounts and actions,
          then upload back.
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            className="btn btn-ghost"
            onClick={loadPendingSubmissions}
            disabled={loadingPending}
          >
            {loadingPending ? "Loading..." : "🔄 Load Pending Submissions"}
          </button>
          {pendingSubs.length > 0 && (
            <>
              <input
                className="input"
                type="datetime-local"
                style={{ width: 210 }}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="From date"
              />
              <input
                className="input"
                type="datetime-local"
                style={{ width: 210 }}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="To date"
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                title="Clear dates"
              >
                ✕ Clear
              </button>
              <div style={{ color: "var(--text3)", fontSize: 12 }}>
                {filteredPendingSubs.length} results
                {(dateFrom || dateTo) && ` (filtered)`}
              </div>
            </>
          )}
          {pendingSubs.length > 0 && (
            <button className="btn btn-primary" onClick={downloadPendingCSV}>
              <Download size={13} /> Download {filteredPendingSubs.length}{" "}
              Pending as CSV
            </button>
          )}
        </div>

        {pendingSubs.length > 0 && (
          <div
            className="table-wrap"
            style={{ marginTop: 16, maxHeight: 240, overflow: "auto" }}
          >
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Challenge</th>
                  <th>Attempt</th>
                  <th>Strava Link</th>
                  <th>Win Streak</th>
                  <th>Prizes Won</th>
                  <th>Total Won</th>
                  <th>Cashback Won</th>
                  <th>Last Code</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filteredPendingSubs.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{s.users?.name}</div>
                      <div
                        className="mono"
                        style={{ color: "var(--text3)", fontSize: 11 }}
                      >
                        {s.users?.phone}
                      </div>
                    </td>
                    <td>{s.challenge_participants?.challenges?.title}</td>
                    <td
                      style={{
                        textAlign: "center",
                        color:
                          s.challenge_participants?.attempt_number > 1
                            ? "var(--orange)"
                            : "var(--text3)",
                        fontWeight:
                          s.challenge_participants?.attempt_number > 1
                            ? 600
                            : 400,
                      }}
                    >
                      #{s.challenge_participants?.attempt_number || 1}
                    </td>
                    <td>
                      <a
                        href={s.strava_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-cell"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <ExternalLink size={11} /> View
                      </a>
                    </td>
                    <td>
                      {s._win?.win_streak ? (
                        <span
                          className="mono"
                          style={{ fontSize: 11, color: "var(--orange)" }}
                        >
                          {s._win.win_streak}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text3)", fontSize: 11 }}>
                          First time
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ color: "var(--green)", fontWeight: 600 }}>
                        {s._win?.prize_count || 0}
                      </span>
                      {s._win?.cashback_count > 0 && (
                        <span style={{ color: "var(--text3)", fontSize: 11 }}>
                          {" "}
                          +{s._win.cashback_count}cb
                        </span>
                      )}
                    </td>
                    <td style={{ color: "var(--orange)", fontWeight: 600 }}>
                      {s._win?.total_prize_won > 0
                        ? `₹${s._win.total_prize_won.toLocaleString("en-IN")}`
                        : "—"}
                    </td>
                    <td style={{ color: "var(--blue)", fontWeight: 600 }}>
                      {s._win?.total_cashback_won > 0
                        ? `₹${s._win.total_cashback_won.toLocaleString("en-IN")}`
                        : "—"}
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {s._win?.last_win_code || "—"}
                    </td>
                    <td style={{ color: "var(--text2)", fontSize: 12 }}>
                      {new Date(s.submitted_at).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Step 2 - Upload filled CSV */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>
          Step 2 — Upload Filled CSV
        </div>
        <div
          style={{
            border: "2px dashed var(--border2)",
            borderRadius: 8,
            padding: "24px 20px",
            textAlign: "center",
            cursor: "pointer",
          }}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={28} color="var(--text3)" style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            Drop CSV or click to browse
          </div>
          <div style={{ color: "var(--text3)", fontSize: 12 }}>
            Columns: submission_id, action (verify/reject), amount, win_code,
            rejection_reason
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </div>

        {rows.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <span style={{ color: "var(--green)", fontSize: 13 }}>
                ✓ {verifyCount} to verify
              </span>
              <span style={{ color: "var(--red)", fontSize: 13 }}>
                ✗ {rejectCount} to reject
              </span>
            </div>

            <div
              className="table-wrap"
              style={{ maxHeight: 200, overflow: "auto", marginBottom: 16 }}
            >
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Submission ID</th>
                    <th>Action</th>
                    <th>Amount</th>
                    <th>Reward Type</th>
                    <th>Win Code</th>
                    <th>Metric</th>
                    <th>Rejection Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ color: "var(--text3)" }}>{i + 1}</td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {r.submission_id?.slice(0, 18)}...
                      </td>
                      <td>
                        <span
                          className={`badge ${r.action === "verify" ? "badge-verified" : "badge-rejected"}`}
                        >
                          {r.action}
                        </span>
                      </td>
                      <td style={{ color: "var(--orange)", fontWeight: 600 }}>
                        {r.amount ? `₹${r.amount}` : "—"}
                      </td>
                      <td>
                        <span className="badge badge-pending">
                          {r.reward_type || "prize"}
                        </span>
                      </td>
                      <td className="mono">{r.win_code || "—"}</td>
                      <td style={{ color: "var(--text2)", fontSize: 12 }}>
                        {r.metric_achieved ? `${r.metric_achieved}` : "—"}
                      </td>
                      <td style={{ color: "var(--text2)", fontSize: 12 }}>
                        {r.rejection_reason || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: 10 }}
              onClick={handleProcess}
              disabled={processing}
            >
              {processing
                ? `Processing... ${progress}%`
                : `🚀 Process ${rows.length} Submissions`}
            </button>

            {processing && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    height: 4,
                    background: "var(--border)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progress}%`,
                      background: "var(--orange)",
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text2)",
                    marginTop: 4,
                    textAlign: "center",
                  }}
                >
                  {progress}% — notifications fire automatically
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: 16,
            }}
          >
            <span style={{ fontWeight: 600 }}>Results</span>
            {successCount > 0 && (
              <span style={{ color: "var(--green)", fontSize: 12 }}>
                ✓ {successCount} success
              </span>
            )}
            {errorCount > 0 && (
              <span style={{ color: "var(--red)", fontSize: 12 }}>
                ✗ {errorCount} failed
              </span>
            )}
            {errorCount > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  exportCsv(
                    results
                      .filter((r) => r.status === "error")
                      .map((r) => ({ ...r.row, error: r.message })) as Record<
                      string,
                      unknown
                    >[],
                    "zelth_failed_rows",
                  )
                }
              >
                <Download size={13} /> Download {errorCount} Failed Rows
              </button>
            )}
            {results.length > 0 && !processing && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  exportCsv(
                    results.map((r, i) => ({
                      row_number: i + 1,
                      status: r.status,
                      message: r.message || "",
                      processed_at: new Date().toISOString(),
                      ...r.row,
                    })) as Record<string, unknown>[],
                    "zelth_results",
                  )
                }
              >
                <Download size={13} /> Download Results CSV
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Submission ID</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--text3)" }}>{i + 1}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {r.row.submission_id?.slice(0, 18)}...
                    </td>
                    <td>
                      <span
                        className={`badge ${r.row.action === "verify" ? "badge-verified" : "badge-rejected"}`}
                      >
                        {r.row.action}
                      </span>
                    </td>
                    <td>
                      {r.status === "success" && (
                        <CheckCircle size={14} color="var(--green)" />
                      )}
                      {r.status === "error" && (
                        <XCircle size={14} color="var(--red)" />
                      )}
                      {r.status === "pending" && (
                        <Clock size={14} color="var(--text3)" />
                      )}
                    </td>
                    <td
                      style={{
                        fontSize: 12,
                        color:
                          r.status === "error"
                            ? "var(--red)"
                            : r.status === "success"
                              ? "var(--green)"
                              : "var(--text3)",
                      }}
                    >
                      {r.message || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
