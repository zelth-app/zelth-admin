import { Fragment, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { adminDb } from "../lib/supabase";
import { toast } from "../components/Toast";
import { exportCsv } from "../lib/exportCsv";
import {
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Edit2,
  Check,
  Upload,
  Download,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

const FITNESS_GOAL_LABELS: Record<string, string> = {
  lose_weight: "Lose Weight",
  build_muscle: "Build Muscle",
  build_stamina: "Build Stamina",
  stay_active: "Stay Active",
  lose_weight_build_muscle: "Lose Weight + Build Muscle",
};

const COACH_ACTIVATE_TEMPLATE = `INSTRUCTIONS,READ ONLY columns (do not edit ref_ columns),READ ONLY,READ ONLY,READ ONLY,READ ONLY,READ ONLY,FILL THIS (copy ref_user_id here),FILL THIS
ref_user_id,ref_name,ref_phone,ref_goal,ref_height_cm,ref_weight_kg,ref_subscribed_on,user_id,coach_dashboard_url
example-user-uuid,John Doe,9876543210,Build Muscle,175,75,2026-01-01,example-user-uuid,https://app.example.com/coach/john`;

const REVIEW_SECTION_LABEL: React.CSSProperties = {
  color: "var(--text3)",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.8px",
  textTransform: "uppercase",
  marginBottom: 8,
};

// Onboarding fields are rendered generically so a new question shows up here
// without a code change — keys arrive as snake_case or camelCase.
function formatFieldLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

interface PendingUser {
  id: string;
  name: string | null;
  phone: string;
  fitness_goals: string[] | null;
  height_cm: number | null;
  weight_kg: number | null;
  subscription_start: string | null;
  subscription_end: string | null;
  trial_used: boolean | null;
}

interface ActiveCoachUser {
  id: string;
  name: string | null;
  phone: string;
  fitness_goals: string[] | null;
  coach_dashboard_url: string | null;
  subscription_end: string | null;
}

interface OnboardingSubmission {
  id: string;
  user_id: string;
  raw_answers: Record<string, unknown>;
  audio_urls: Record<string, string>;
  transcripts: Record<string, string>;
  processed_data: Record<string, unknown> | null;
  admin_edited_data: Record<string, unknown> | null;
  status:
    | "submitted"
    | "transcribing"
    | "transcribed"
    | "processing"
    | "processed"
    | "approved"
    | "failed";
  error_message: string | null;
}

interface CoachCsvRow {
  ref_user_id: string;
  ref_name: string;
  ref_phone: string;
  ref_goal: string;
  ref_height_cm: string;
  ref_weight_kg: string;
  ref_subscribed_on: string;
  user_id: string;
  coach_dashboard_url: string;
}

interface CoachResult {
  row: CoachCsvRow;
  status: "success" | "error" | "skipped" | "pending";
  message?: string;
}

export function Coach() {
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [active, setActive] = useState<ActiveCoachUser[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingActive, setLoadingActive] = useState(true);
  const [dashboardUrls, setDashboardUrls] = useState<Record<string, string>>(
    {},
  );
  const [dashboardBaseUrl, setDashboardBaseUrl] = useState<string>("");
  const [activating, setActivating] = useState<string | null>(null);
  const [editUrls, setEditUrls] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState<string | null>(
    null,
  );
  const [activeCollapsed, setActiveCollapsed] = useState(false);

  // Onboarding review state
  const [submissions, setSubmissions] = useState<OnboardingSubmission[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [editedJson, setEditedJson] = useState<Record<string, string>>({});
  const [jsonError, setJsonError] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  // CSV bulk activation state
  const [csvRows, setCsvRows] = useState<CoachCsvRow[]>([]);
  const [csvResults, setCsvResults] = useState<CoachResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPending();
    loadActive();
    loadSubmissions();
    loadDashboardBaseUrl();
  }, []);

  // Covers the first-mount race where coach_dashboard_base_url finishes
  // loading after loadPending() already ran with an empty dashboardBaseUrl.
  useEffect(() => {
    if (!dashboardBaseUrl || pending.length === 0) return;
    setDashboardUrls((prev) => {
      const next = { ...prev };
      for (const u of pending) {
        if (!(u.id in next)) {
          next[u.id] = `${dashboardBaseUrl}?user=${u.id}`;
        }
      }
      return next;
    });
  }, [dashboardBaseUrl, pending]);

  async function loadDashboardBaseUrl() {
    try {
      const { data } = await adminDb("select", {
        table: "app_config",
        columns: "value",
        filters: { key: "coach_dashboard_base_url" },
      });
      const raw = data?.[0]?.value;
      setDashboardBaseUrl(
        typeof raw === "string" ? raw.replace(/^"|"$/g, "") : raw || "",
      );
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  async function loadPending() {
    setLoadingPending(true);
    try {
      const { data } = await adminDb("select", {
        table: "users",
        columns:
          "id, name, phone, fitness_goals, height_cm, weight_kg, subscription_start, subscription_end, trial_used",
        gte: { subscription_end: new Date().toISOString() },
        filters: { coach_active: false },
        order: { column: "subscription_start", ascending: true },
      });
      setPending(data || []);
      setDashboardUrls((prev) => {
        const next = { ...prev };
        for (const u of data || []) {
          if (!(u.id in next) && dashboardBaseUrl) {
            next[u.id] = `${dashboardBaseUrl}?user=${u.id}`;
          }
        }
        return next;
      });
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoadingPending(false);
    }
  }

  async function loadActive() {
    setLoadingActive(true);
    try {
      const { data } = await adminDb("select", {
        table: "users",
        columns:
          "id, name, phone, fitness_goals, coach_dashboard_url, subscription_end",
        filters: { coach_active: true },
        order: { column: "subscription_end", ascending: false },
      });
      setActive(data || []);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoadingActive(false);
    }
  }

  // A user can have more than one submission row (a resubmission after an
  // earlier approval), so order newest-first — submissionForUser takes the
  // first match and must land on the current one, not an arbitrary old row.
  async function loadSubmissions() {
    try {
      const { data } = await adminDb("select", {
        table: "coach_onboarding_submissions",
        columns:
          "id, user_id, raw_answers, audio_urls, transcripts, processed_data, admin_edited_data, status, error_message",
        order: { column: "updated_at", ascending: false },
      });
      setSubmissions(data || []);
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  function refresh() {
    loadPending();
    loadActive();
    loadSubmissions();
  }

  function getGoalLabel(goals: string[] | null) {
    if (!goals || goals.length === 0) return "—";
    return FITNESS_GOAL_LABELS[goals[0]] || goals[0];
  }

  const submissionForUser = (userId: string) =>
    submissions.find((s) => s.user_id === userId);

  function toggleExpanded(userId: string) {
    setExpandedIds((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  // ── Inline single-row activation ──────────────────────────────────────────

  async function handleActivate(user: PendingUser) {
    const url = (dashboardUrls[user.id] || "").trim();
    if (!url) {
      toast("Dashboard URL is required", "error");
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      toast("URL must start with http:// or https://", "error");
      return;
    }
    setActivating(user.id);
    try {
      await adminDb("update", {
        table: "users",
        data: { coach_active: true, coach_dashboard_url: url },
        filters: { id: user.id },
      });
      toast(`Coach activated for ${user.name || user.phone}`);
      setDashboardUrls((prev) => {
        const n = { ...prev };
        delete n[user.id];
        return n;
      });
      refresh();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setActivating(null);
    }
  }

  // ── Onboarding review actions ─────────────────────────────────────────────

  function submissionJson(submission: OnboardingSubmission) {
    return JSON.stringify(
      submission.admin_edited_data ?? submission.processed_data,
      null,
      2,
    );
  }

  async function handleApproveAndActivate(
    user: PendingUser,
    submission: OnboardingSubmission,
  ) {
    const raw = editedJson[submission.id] ?? submissionJson(submission);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setJsonError({
        ...jsonError,
        [submission.id]: "Invalid JSON — fix before approving",
      });
      return;
    }

    const url = (dashboardUrls[user.id] || "").trim();
    if (!url) {
      toast("Dashboard URL is required", "error");
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      toast("URL must start with http:// or https://", "error");
      return;
    }

    setApproving(submission.id);
    try {
      await adminDb("update", {
        table: "coach_onboarding_submissions",
        data: {
          admin_edited_data: parsed,
          status: "approved",
          // approved_by stays null — it's a uuid FK to users(id) and this panel
          // has no per-admin identity to attribute the approval to.
          approved_at: new Date().toISOString(),
        },
        filters: { id: submission.id },
      });
      await adminDb("update", {
        table: "users",
        data: { coach_active: true, coach_dashboard_url: url },
        filters: { id: user.id },
      });

      try {
        const syncRes = await adminDb("sync_coach_sheet", {
          user_id: user.id,
          submission_id: submission.id,
        });
        if (syncRes.data?.reason === "not_configured") {
          toast(
            "Approved! (Sheet sync not yet configured — will sync once Google credentials are added)",
          );
        } else {
          toast("Approved and synced to sheet!");
        }
      } catch (syncErr: any) {
        // Activation already succeeded — a sheet sync failure should NOT undo that or block the UI.
        toast(`Approved, but sheet sync failed: ${syncErr.message}`, "error");
        console.error(
          "[Coach.tsx] sheet sync failed after successful approval:",
          syncErr,
        );
      }

      setEditedJson((prev) => {
        const n = { ...prev };
        delete n[submission.id];
        return n;
      });
      setJsonError((prev) => {
        const n = { ...prev };
        delete n[submission.id];
        return n;
      });
      setDashboardUrls((prev) => {
        const n = { ...prev };
        delete n[user.id];
        return n;
      });
      refresh();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setApproving(null);
    }
  }

  async function handleRetryProcessing(submission: OnboardingSubmission) {
    setRetrying(submission.id);
    try {
      await adminDb("retry_coach_processing", { submission_id: submission.id });
      toast("Reprocessing started — check back shortly");
      refresh();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setRetrying(null);
    }
  }

  // ── Active-section actions ────────────────────────────────────────────────

  async function handleSaveUrl(user: ActiveCoachUser) {
    const url = (editUrls[user.id] || "").trim();
    if (!url) {
      toast("Dashboard URL is required", "error");
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      toast("URL must start with http:// or https://", "error");
      return;
    }
    setSaving(user.id);
    try {
      await adminDb("update", {
        table: "users",
        data: { coach_dashboard_url: url },
        filters: { id: user.id },
      });
      toast("Dashboard URL updated");
      setEditingId(null);
      loadActive();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(null);
    }
  }

  async function handleDeactivate(userId: string) {
    setSaving(userId);
    try {
      await adminDb("update", {
        table: "users",
        data: { coach_active: false },
        filters: { id: userId },
      });
      toast("Coach access deactivated");
      setDeactivateConfirm(null);
      refresh();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(null);
    }
  }

  // ── CSV bulk activation ───────────────────────────────────────────────────

  function downloadTemplate() {
    const blob = new Blob([COACH_ACTIVATE_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zelth_coach_activate_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPendingCsv() {
    if (!pending.length) {
      toast("No pending users to export", "error");
      return;
    }
    const csvData = pending.map((u) => ({
      ref_user_id: u.id,
      ref_name: u.name || "",
      ref_phone: u.phone,
      ref_goal: getGoalLabel(u.fitness_goals),
      ref_height_cm: u.height_cm ?? "",
      ref_weight_kg: u.weight_kg ?? "",
      ref_subscribed_on: u.subscription_start
        ? new Date(u.subscription_start).toLocaleDateString("en-CA")
        : "",
      user_id: u.id,
      coach_dashboard_url: "",
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zelth_pending_coach_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("CSV downloaded — fill in coach_dashboard_url and upload back");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvResults([]);
    Papa.parse<CoachCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      beforeFirstChunk: (chunk) => {
        const lines = chunk.split("\n");
        lines.splice(0, 1); // remove INSTRUCTIONS row
        return lines.join("\n");
      },
      complete: (result) => {
        setCsvRows(result.data);
        toast(`${result.data.length} rows loaded`, "info");
      },
      error: (err) => toast(err.message, "error"),
    });
  }

  async function handleProcess() {
    if (!csvRows.length) {
      toast("Upload a CSV first", "error");
      return;
    }

    const toActivate = csvRows.filter(
      (r) => (r.coach_dashboard_url || "").trim() !== "",
    );
    const toSkip = csvRows.filter(
      (r) => (r.coach_dashboard_url || "").trim() === "",
    );

    const confirmed = window.confirm(
      `${toActivate.length} rows will be activated, ${toSkip.length} rows skipped (no URL). Continue?`,
    );
    if (!confirmed) return;

    setProcessing(true);
    setProgress(0);

    const res: CoachResult[] = csvRows.map((row) => ({
      row,
      status: "pending",
    }));
    setCsvResults([...res]);

    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      const url = (row.coach_dashboard_url || "").trim();

      if (!url) {
        res[i] = { row, status: "skipped", message: "No URL — skipped" };
      } else if (!url.startsWith("http://") && !url.startsWith("https://")) {
        res[i] = {
          row,
          status: "error",
          message: "URL must start with http:// or https://",
        };
      } else if (!row.user_id) {
        res[i] = { row, status: "error", message: "Missing user_id" };
      } else {
        try {
          await adminDb("update", {
            table: "users",
            data: { coach_active: true, coach_dashboard_url: url },
            filters: { id: row.user_id },
          });
          res[i] = { row, status: "success", message: "✓ Coach activated" };
        } catch (e: any) {
          res[i] = { row, status: "error", message: e.message };
        }
      }

      setCsvResults([...res]);
      setProgress(Math.round(((i + 1) / csvRows.length) * 100));
      await new Promise((r) => setTimeout(r, 200));
    }

    setProcessing(false);

    const successCount = res.filter((r) => r.status === "success").length;
    const errorCount = res.filter((r) => r.status === "error").length;
    const skippedCount = res.filter((r) => r.status === "skipped").length;
    toast(
      `Done! ${successCount} activated, ${skippedCount} skipped, ${errorCount} failed`,
      errorCount > 0 && successCount === 0 ? "error" : "success",
    );

    exportCsv(
      res.map((r, i) => ({
        row_number: i + 1,
        ref_name: r.row.ref_name,
        ref_phone: r.row.ref_phone,
        user_id: r.row.user_id,
        coach_dashboard_url: r.row.coach_dashboard_url,
        status: r.status,
        message: r.message || "",
        processed_at: new Date().toISOString(),
      })) as Record<string, unknown>[],
      "zelth_coach_activate_results",
    );

    refresh();
  }

  const csvActivateCount = csvRows.filter(
    (r) => (r.coach_dashboard_url || "").trim() !== "",
  ).length;
  const csvSkipCount = csvRows.filter(
    (r) => (r.coach_dashboard_url || "").trim() === "",
  ).length;
  const csvSuccessCount = csvResults.filter(
    (r) => r.status === "success",
  ).length;
  const csvErrorCount = csvResults.filter((r) => r.status === "error").length;

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Coach Management</div>
          <div className="page-subtitle">
            Activate and manage coach dashboard access for users
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refresh}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* ── Section 1: Pending Setup ────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>Pending Setup</div>
        <span className="badge badge-pending">{pending.length}</span>
      </div>

      {/* Inline single-row activation */}
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
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
                {pending.map((user) => {
                  const submission = submissionForUser(user.id);
                  const status = submission?.status;
                  // "transcribed" is an intermediate state before the
                  // processing stage — nothing to review yet either way.
                  const isProcessing =
                    status === "submitted" ||
                    status === "transcribing" ||
                    status === "transcribed" ||
                    status === "processing";
                  // "approved" is reviewable too: the user is still pending, so
                  // the submission was approved but activation never landed —
                  // the panel is how that gets finished. Must stay in sync with
                  // the panel's own condition or the Review button does nothing.
                  const isReviewable =
                    status === "processed" || status === "approved";
                  const expanded = !!expandedIds[user.id];

                  const urlInput = (
                    <input
                      className="input"
                      style={{ fontSize: 12 }}
                      placeholder="https://coach.example.com/dashboard/..."
                      value={dashboardUrls[user.id] || ""}
                      onChange={(e) =>
                        setDashboardUrls((prev) => ({
                          ...prev,
                          [user.id]: e.target.value,
                        }))
                      }
                    />
                  );

                  const activateButton = (
                    <button
                      className="btn btn-success btn-sm"
                      disabled={activating === user.id}
                      onClick={() => handleActivate(user)}
                    >
                      {activating === user.id ? "Activating..." : "Activate"}
                    </button>
                  );

                  return (
                    <Fragment key={user.id}>
                      <tr>
                        <td>
                          <div style={{ fontWeight: 500 }}>
                            {user.name || (
                              <span style={{ color: "var(--text3)" }}>—</span>
                            )}
                          </div>
                        </td>
                        <td className="mono">{user.phone}</td>
                        <td style={{ color: "var(--text2)" }}>
                          {getGoalLabel(user.fitness_goals)}
                        </td>
                        <td style={{ color: "var(--text2)" }}>
                          {user.height_cm != null
                            ? `${user.height_cm} cm`
                            : "—"}
                        </td>
                        <td style={{ color: "var(--text2)" }}>
                          {user.weight_kg != null
                            ? `${user.weight_kg} kg`
                            : "—"}
                        </td>
                        <td style={{ color: "var(--text3)", fontSize: 12 }}>
                          {user.subscription_start
                            ? new Date(
                                user.subscription_start,
                              ).toLocaleDateString("en-IN")
                            : "—"}
                        </td>
                        <td>
                          {user.trial_used === false ? (
                            <span className="badge badge-pending">Trial</span>
                          ) : (
                            <span className="badge badge-verified">
                              Returning
                            </span>
                          )}
                        </td>

                        {!submission ? (
                          /* No onboarding submission — plain manual activation */
                          <>
                            <td style={{ minWidth: 280 }}>{urlInput}</td>
                            <td>{activateButton}</td>
                          </>
                        ) : isProcessing ? (
                          /* Review gate stays closed while processing is in flight */
                          <>
                            <td style={{ minWidth: 280 }}>
                              <span className="badge badge-pending">
                                <Clock size={11} /> Processing...
                              </span>
                            </td>
                            <td style={{ color: "var(--text3)" }}>—</td>
                          </>
                        ) : status === "failed" ? (
                          <>
                            <td style={{ minWidth: 280 }}>
                              {expanded ? (
                                urlInput
                              ) : (
                                <span
                                  style={{ color: "var(--red)", fontSize: 12 }}
                                >
                                  {submission.error_message ||
                                    "Processing failed"}
                                </span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={retrying === submission.id}
                                  onClick={() =>
                                    handleRetryProcessing(submission)
                                  }
                                >
                                  {retrying === submission.id
                                    ? "Retrying..."
                                    : "🔄 Retry Processing"}
                                </button>
                                {expanded ? (
                                  activateButton
                                ) : (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => toggleExpanded(user.id)}
                                  >
                                    Activate manually (skip review)
                                  </button>
                                )}
                              </div>
                            </td>
                          </>
                        ) : isReviewable ? (
                          /* processed / approved — review before activating */
                          <>
                            <td style={{ minWidth: 280 }}>
                              {status === "approved" ? (
                                <span className="badge badge-submitted">
                                  Approved — not activated
                                </span>
                              ) : (
                                <span className="badge badge-verified">
                                  Ready for review
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => toggleExpanded(user.id)}
                              >
                                {expanded ? "Hide" : "Review →"}
                              </button>
                            </td>
                          </>
                        ) : (
                          /* Unknown status — never leave the row with no way
                             forward; fall back to plain manual activation. */
                          <>
                            <td style={{ minWidth: 280 }}>{urlInput}</td>
                            <td>{activateButton}</td>
                          </>
                        )}
                      </tr>

                      {submission && isReviewable && expanded && (
                        <tr>
                          <td
                            colSpan={9}
                            style={{
                              background: "var(--bg2)",
                              padding: "16px 20px",
                            }}
                          >
                            <div style={{ display: "grid", gap: 18 }}>
                              <div>
                                <div style={REVIEW_SECTION_LABEL}>
                                  Raw Answers
                                </div>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "220px 1fr",
                                    gap: "6px 16px",
                                    fontSize: 12,
                                  }}
                                >
                                  {Object.entries(
                                    submission.raw_answers || {},
                                  ).map(([key, value]) => (
                                    <Fragment key={key}>
                                      <div style={{ color: "var(--text3)" }}>
                                        {formatFieldLabel(key)}
                                      </div>
                                      <div style={{ color: "var(--text2)" }}>
                                        {formatFieldValue(value)}
                                      </div>
                                    </Fragment>
                                  ))}
                                </div>
                              </div>

                              {Object.keys(submission.transcripts || {})
                                .length > 0 && (
                                <div>
                                  <div style={REVIEW_SECTION_LABEL}>
                                    Transcripts
                                  </div>
                                  {Object.entries(submission.transcripts).map(
                                    ([key, value]) => (
                                      <div
                                        key={key}
                                        style={{ marginBottom: 8 }}
                                      >
                                        <div
                                          style={{
                                            color: "var(--text3)",
                                            fontSize: 12,
                                            marginBottom: 3,
                                          }}
                                        >
                                          {formatFieldLabel(key)}
                                        </div>
                                        <div
                                          style={{
                                            color: "var(--text2)",
                                            fontSize: 12,
                                            fontStyle: "italic",
                                            background: "var(--bg3)",
                                            border: "1px solid var(--border)",
                                            borderRadius: 6,
                                            padding: "8px 10px",
                                          }}
                                        >
                                          “{value || "—"}”
                                        </div>
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}

                              <div>
                                <div style={REVIEW_SECTION_LABEL}>
                                  Processed Data (Gemini output — edit if
                                  needed)
                                </div>
                                <textarea
                                  className="input"
                                  style={{
                                    width: "100%",
                                    minHeight: 400,
                                    fontFamily: "monospace",
                                    fontSize: 12,
                                    lineHeight: 1.5,
                                    resize: "vertical",
                                  }}
                                  value={
                                    editedJson[submission.id] ??
                                    submissionJson(submission)
                                  }
                                  onChange={(e) =>
                                    setEditedJson((prev) => ({
                                      ...prev,
                                      [submission.id]: e.target.value,
                                    }))
                                  }
                                />
                                {jsonError[submission.id] && (
                                  <div
                                    style={{
                                      color: "var(--red)",
                                      fontSize: 12,
                                      marginTop: 6,
                                    }}
                                  >
                                    {jsonError[submission.id]}
                                  </div>
                                )}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 10,
                                  alignItems: "center",
                                }}
                              >
                                <div style={{ flex: 1 }}>{urlInput}</div>
                                <button
                                  className="btn btn-success"
                                  disabled={approving === submission.id}
                                  onClick={() =>
                                    handleApproveAndActivate(user, submission)
                                  }
                                >
                                  {approving === submission.id
                                    ? "Approving..."
                                    : "✅ Approve & Activate"}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CSV Bulk Activation ─────────────────────────────────────────── */}
      <div
        style={{
          color: "var(--text3)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Bulk Activation via CSV
      </div>

      {/* Step 1 — Get pending as CSV */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>
          Step 1 — Download Pending Users
        </div>
        <p style={{ color: "var(--text2)", fontSize: 13, marginBottom: 12 }}>
          Download the pending list, fill in{" "}
          <code
            style={{
              background: "var(--bg3)",
              padding: "1px 5px",
              borderRadius: 4,
            }}
          >
            coach_dashboard_url
          </code>{" "}
          for each user, then upload back.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
            <Download size={13} /> Download Template
          </button>
          <button
            className="btn btn-primary"
            onClick={downloadPendingCsv}
            disabled={loadingPending || pending.length === 0}
          >
            <Download size={13} /> Download {pending.length} Pending as CSV
          </button>
        </div>
      </div>

      {/* Step 2 — Upload filled CSV */}
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
            Columns: user_id, coach_dashboard_url (rows with empty URL are
            skipped)
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </div>

        {csvRows.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "var(--green)", fontSize: 13 }}>
                ✓ {csvActivateCount} to activate
              </span>
              <span style={{ color: "var(--text3)", fontSize: 13 }}>
                — {csvSkipCount} skipped (no URL)
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
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Goal</th>
                    <th>User ID</th>
                    <th>Dashboard URL</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ color: "var(--text3)" }}>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{r.ref_name || "—"}</td>
                      <td className="mono">{r.ref_phone || "—"}</td>
                      <td style={{ color: "var(--text2)" }}>
                        {r.ref_goal || "—"}
                      </td>
                      <td
                        className="mono"
                        style={{ fontSize: 11, color: "var(--text3)" }}
                      >
                        {r.user_id ? `${r.user_id.slice(0, 12)}…` : "—"}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {r.coach_dashboard_url ? (
                          <span style={{ color: "var(--blue)" }}>
                            {r.coach_dashboard_url.slice(0, 40)}
                            {r.coach_dashboard_url.length > 40 ? "…" : ""}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text3)" }}>
                            — (will skip)
                          </span>
                        )}
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
                : `🚀 Activate ${csvActivateCount} Coach Users`}
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
                  {progress}%
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CSV Results */}
      {csvResults.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 28 }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600 }}>Results</span>
            {csvSuccessCount > 0 && (
              <span style={{ color: "var(--green)", fontSize: 12 }}>
                ✓ {csvSuccessCount} activated
              </span>
            )}
            {csvErrorCount > 0 && (
              <span style={{ color: "var(--red)", fontSize: 12 }}>
                ✗ {csvErrorCount} failed
              </span>
            )}
            {csvErrorCount > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  exportCsv(
                    csvResults
                      .filter((r) => r.status === "error")
                      .map((r) => ({ ...r.row, error: r.message })) as Record<
                      string,
                      unknown
                    >[],
                    "zelth_coach_failed_rows",
                  )
                }
              >
                <Download size={13} /> Download {csvErrorCount} Failed Rows
              </button>
            )}
            {csvResults.length > 0 && !processing && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  exportCsv(
                    csvResults.map((r, i) => ({
                      row_number: i + 1,
                      ref_name: r.row.ref_name,
                      ref_phone: r.row.ref_phone,
                      user_id: r.row.user_id,
                      coach_dashboard_url: r.row.coach_dashboard_url,
                      status: r.status,
                      message: r.message || "",
                    })) as Record<string, unknown>[],
                    "zelth_coach_results",
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
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Dashboard URL</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {csvResults.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--text3)" }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{r.row.ref_name || "—"}</td>
                    <td className="mono">{r.row.ref_phone || "—"}</td>
                    <td
                      style={{
                        fontSize: 12,
                        color: "var(--text2)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.row.coach_dashboard_url || "—"}
                    </td>
                    <td>
                      {r.status === "success" && (
                        <CheckCircle size={14} color="var(--green)" />
                      )}
                      {r.status === "error" && (
                        <XCircle size={14} color="var(--red)" />
                      )}
                      {r.status === "skipped" && (
                        <span style={{ color: "var(--text3)", fontSize: 12 }}>
                          —
                        </span>
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

      {/* ── Section 2: Active Coach Users ───────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: "3px 7px" }}
          onClick={() => setActiveCollapsed((c) => !c)}
        >
          {activeCollapsed ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronUp size={14} />
          )}
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
                  {active.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {user.name || (
                            <span style={{ color: "var(--text3)" }}>—</span>
                          )}
                        </div>
                      </td>
                      <td className="mono">{user.phone}</td>
                      <td style={{ color: "var(--text2)" }}>
                        {getGoalLabel(user.fitness_goals)}
                      </td>
                      <td style={{ minWidth: 260 }}>
                        {editingId === user.id ? (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              alignItems: "center",
                            }}
                          >
                            <input
                              className="input"
                              style={{ fontSize: 12 }}
                              value={
                                editUrls[user.id] ??
                                (user.coach_dashboard_url || "")
                              }
                              onChange={(e) =>
                                setEditUrls((prev) => ({
                                  ...prev,
                                  [user.id]: e.target.value,
                                }))
                              }
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
                            style={{
                              color: "var(--blue)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 12,
                            }}
                            title={user.coach_dashboard_url}
                          >
                            <span
                              style={{
                                maxWidth: 220,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "inline-block",
                              }}
                            >
                              {user.coach_dashboard_url}
                            </span>
                            <ExternalLink size={11} style={{ flexShrink: 0 }} />
                          </a>
                        ) : (
                          <span style={{ color: "var(--text3)" }}>—</span>
                        )}
                      </td>
                      <td style={{ color: "var(--text3)", fontSize: 12 }}>
                        {user.subscription_end
                          ? new Date(user.subscription_end).toLocaleDateString(
                              "en-IN",
                            )
                          : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {editingId === user.id ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setEditingId(user.id);
                                setEditUrls((prev) => ({
                                  ...prev,
                                  [user.id]: user.coach_dashboard_url || "",
                                }));
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
        <div
          className="modal-overlay"
          onClick={() => setDeactivateConfirm(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Deactivate Coach Access</div>
            <p
              style={{ color: "var(--text2)", fontSize: 13, marginBottom: 20 }}
            >
              Are you sure? This user will lose access to their coach dashboard.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setDeactivateConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 2 }}
                disabled={saving === deactivateConfirm}
                onClick={() => handleDeactivate(deactivateConfirm)}
              >
                {saving === deactivateConfirm
                  ? "Deactivating..."
                  : "Yes, Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
