import { useEffect, useState } from "react";
import { adminDb } from "../lib/supabase";
import { toast } from "../components/Toast";
import { RefreshCw, Check, X, Download } from "lucide-react";
import { exportCsv } from "../lib/exportCsv";

interface Withdrawal {
  id: string;
  amount: number;
  upi_id: string;
  status: string;
  requested_at: string;
  processed_at: string | null;
  failure_reason: string | null;
  cashfree_transfer_id: string | null;
  wallet_transaction_id: string | null;
  user_name: string;
  phone: string;
  user_id: string;
  wallet_balance: number;
  wallet_id: string;
}

export function Withdrawals() {
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [saving, setSaving] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rejectModal, setRejectModal] = useState<{
    id: string;
    reason: string;
    user_id: string;
    amount: number;
    wallet_id: string;
    txn_id: string | null;
  } | null>(null);
  const [approveModal, setApproveModal] = useState<{
    id: string;
    amount: number;
  } | null>(null);
  const [transferId, setTransferId] = useState("");

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function load() {
    setLoading(true);
    try {
      const res = await adminDb("select", {
        table: "withdrawal_requests",
        columns: `id, amount, upi_id, status, requested_at, processed_at, failure_reason, cashfree_transfer_id, wallet_transaction_id, users!inner(id, name, phone, wallet(id, balance))`,
        order: { column: "requested_at", ascending: false },
        ...(statusFilter !== "all"
          ? { filters: { status: statusFilter } }
          : {}),
      });
      const data = res.data;

      setRows(
        (data || []).map((r: any) => ({
          id: r.id,
          amount: Number(r.amount),
          upi_id: r.upi_id,
          status: r.status,
          requested_at: r.requested_at,
          processed_at: r.processed_at,
          failure_reason: r.failure_reason,
          cashfree_transfer_id: r.cashfree_transfer_id ?? null,
          wallet_transaction_id: r.wallet_transaction_id,
          user_name: r.users?.name || "—",
          phone: r.users?.phone || "—",
          user_id: r.users?.id,
          wallet_balance: Number(r.users?.wallet?.[0]?.balance || 0),
          wallet_id: r.users?.wallet?.[0]?.id,
        })),
      );
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string, amount: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setSaving(id);
    try {
      await adminDb("update", {
        table: "withdrawal_requests",
        data: {
          status: "completed",
          processed_at: new Date().toISOString(),
          processed_by: "admin",
          cashfree_transfer_id: transferId || null,
        },
        filters: { id },
      });

      if (row.wallet_transaction_id) {
        await adminDb("update", {
          table: "wallet_transactions",
          data: { status: "completed" },
          filters: { id: row.wallet_transaction_id },
        });
      }

      const wRes = await adminDb("select", {
        table: "wallet",
        columns: "total_withdrawn",
        filters: { id: row.wallet_id },
      });
      const wData = wRes.data?.[0];
      if (!wData)
        throw new Error("Could not load wallet to update total withdrawn");
      await adminDb("update", {
        table: "wallet",
        data: {
          total_withdrawn: Number(wData.total_withdrawn) + amount,
          updated_at: new Date().toISOString(),
        },
        filters: { id: row.wallet_id },
      });

      toast(`✅ Withdrawal approved — ₹${amount} to ${row.upi_id}`);
      setApproveModal(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(null);
    }
  }

  async function handleReject() {
    if (!rejectModal) return;
    setSaving(rejectModal.id);
    try {
      await adminDb("update", {
        table: "withdrawal_requests",
        data: {
          status: "failed",
          processed_at: new Date().toISOString(),
          processed_by: "admin",
          failure_reason: rejectModal.reason,
        },
        filters: { id: rejectModal.id },
      });

      if (rejectModal.txn_id) {
        await adminDb("update", {
          table: "wallet_transactions",
          data: { status: "reversed" },
          filters: { id: rejectModal.txn_id },
        });
      }

      const wRes = await adminDb("select", {
        table: "wallet",
        columns: "balance",
        filters: { id: rejectModal.wallet_id },
      });
      const wData = wRes.data?.[0];
      if (!wData) throw new Error("Could not load wallet to refund balance");
      await adminDb("update", {
        table: "wallet",
        data: {
          balance: Number(wData.balance) + rejectModal.amount,
          updated_at: new Date().toISOString(),
        },
        filters: { id: rejectModal.wallet_id },
      });

      toast("Withdrawal rejected — amount refunded to wallet");
      setRejectModal(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(null);
    }
  }

  const filtered = rows.filter((r) => {
    const matchFrom =
      !dateFrom || new Date(r.requested_at) >= new Date(dateFrom);
    const matchTo = !dateTo || new Date(r.requested_at) <= new Date(dateTo);
    return matchFrom && matchTo;
  });

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Withdrawals</div>
          <div className="page-subtitle">Manage user withdrawal requests</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              exportCsv(
                filtered.map((r) => ({
                  id: r.id,
                  user_name: r.user_name,
                  phone: r.phone,
                  amount: r.amount,
                  upi_id: r.upi_id,
                  status: r.status,
                  requested_at: r.requested_at,
                  processed_at: r.processed_at,
                  failure_reason: r.failure_reason,
                })),
                "zelth_withdrawals",
              )
            }
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      <div className="filters">
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
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
          {filtered.length} results
          {(dateFrom || dateTo) && ` (filtered)`}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💸</div>
            <div className="empty-text">No withdrawals found</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Amount</th>
                  <th>UPI ID</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Wallet Balance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.user_name}</div>
                      <div className="mono" style={{ color: "var(--text3)" }}>
                        {row.phone}
                      </div>
                    </td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: "var(--orange)",
                        fontSize: 15,
                      }}
                    >
                      ₹{row.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="mono">{row.upi_id}</td>
                    <td>
                      <span className={`badge badge-${row.status}`}>
                        {row.status}
                      </span>
                      {row.failure_reason && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--red)",
                            marginTop: 2,
                          }}
                        >
                          {row.failure_reason}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 9,
                          color: "rgba(255,255,255,0.35)",
                          marginTop: 2,
                        }}
                      >
                        {row.cashfree_transfer_id
                          ? "Ref: " + row.cashfree_transfer_id
                          : ""}
                      </div>
                    </td>
                    <td style={{ color: "var(--text2)", fontSize: 12 }}>
                      {new Date(row.requested_at).toLocaleString("en-IN")}
                    </td>
                    <td style={{ color: "var(--green)", fontWeight: 600 }}>
                      ₹{row.wallet_balance.toLocaleString("en-IN")}
                    </td>
                    <td>
                      {row.status === "pending" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn btn-success btn-sm"
                            disabled={saving === row.id}
                            onClick={() => {
                              setApproveModal({
                                id: row.id,
                                amount: row.amount,
                              });
                              setTransferId("");
                            }}
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() =>
                              setRejectModal({
                                id: row.id,
                                reason: "",
                                user_id: row.user_id,
                                amount: row.amount,
                                wallet_id: row.wallet_id,
                                txn_id: row.wallet_transaction_id,
                              })
                            }
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                      {row.status !== "pending" && (
                        <span style={{ color: "var(--text3)", fontSize: 12 }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">❌ Reject Withdrawal</div>
            <p
              style={{ color: "var(--text2)", fontSize: 13, marginBottom: 16 }}
            >
              ₹{rejectModal.amount} will be refunded to user's wallet.
            </p>
            <div>
              <label className="label">Reason *</label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g. Invalid UPI ID, duplicate request..."
                value={rejectModal.reason}
                onChange={(e) =>
                  setRejectModal({ ...rejectModal, reason: e.target.value })
                }
                style={{ resize: "vertical" }}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setRejectModal(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 2 }}
                onClick={handleReject}
                disabled={!!saving}
              >
                {saving ? "Processing..." : "Reject & Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {approveModal && (
        <div className="modal-overlay" onClick={() => setApproveModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Confirm Withdrawal Completion</div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "var(--orange)",
                marginBottom: 16,
              }}
            >
              ₹{approveModal.amount}
            </div>
            <div>
              <label className="label">Transfer ID</label>
              <input
                className="input"
                placeholder="Cashfree / UPI Transfer ID (optional)"
                value={transferId}
                onChange={(e) => setTransferId(e.target.value)}
                autoFocus
              />
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.4)",
                  marginTop: 4,
                }}
              >
                Enter the transfer reference for your records
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setApproveModal(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={saving === approveModal.id}
                onClick={() =>
                  handleApprove(approveModal.id, approveModal.amount)
                }
              >
                {saving === approveModal.id
                  ? "Processing..."
                  : "Mark Completed ✓"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
