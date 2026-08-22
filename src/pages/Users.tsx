import { useEffect, useState } from "react";
import { adminDb } from "../lib/supabase";
import { toast } from "../components/Toast";
import {
  RefreshCw,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { exportCsv } from "../lib/exportCsv";

interface User {
  id: string;
  phone: string;
  name: string | null;
  age: number | null;
  city: string | null;
  gender: string | null;
  language: string;
  upi_id: string | null;
  created_at: string;
  wallet_balance: number;
  total_earned: number;
  total_withdrawn: number;
  join_count: number;
  subscription_end: string | null;
  trial_used: boolean;
  coach_active: boolean;
  fitness_goals: string[] | null;
  height_cm: number | null;
  weight_kg: number | null;
}

interface Stats {
  totalUsers: number;
  premiumCount: number;
  totalWallet: number;
  totalEarned: number;
}

const GOAL_LABELS: Record<string, string> = {
  lose_weight: "Lose Weight",
  build_muscle: "Build Muscle",
  build_stamina: "Build Stamina",
  stay_active: "Stay Active",
  lose_weight_build_muscle: "Lose Weight + Build Muscle",
};

const PAGE_SIZE = 50;
const USER_COLUMNS =
  "id, phone, name, age, city, gender, language, upi_id, created_at, subscription_end, trial_used, coach_active, fitness_goals, height_cm, weight_kg, wallet(balance, total_earned, total_withdrawn)";

const isSubscribed = (u: User) =>
  !!u.subscription_end && new Date(u.subscription_end).getTime() > Date.now();

function mapUser(u: any, joinMap: Record<string, number>): User {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    age: u.age,
    city: u.city,
    gender: u.gender,
    language: u.language,
    upi_id: u.upi_id,
    created_at: u.created_at,
    wallet_balance: Number(u.wallet?.[0]?.balance || 0),
    total_earned: Number(u.wallet?.[0]?.total_earned || 0),
    total_withdrawn: Number(u.wallet?.[0]?.total_withdrawn || 0),
    join_count: joinMap[u.id] || 0,
    subscription_end: u.subscription_end ?? null,
    trial_used: !!u.trial_used,
    coach_active: !!u.coach_active,
    fitness_goals: u.fitness_goals ?? null,
    height_cm: u.height_cm ?? null,
    weight_kg: u.weight_kg ?? null,
  };
}

async function fetchJoinCounts(
  userIds: string[],
): Promise<Record<string, number>> {
  const joinMap: Record<string, number> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += 50) {
    chunks.push(userIds.slice(i, i + 50));
  }
  const joinResults = await Promise.all(
    chunks.map((chunk) =>
      adminDb("select", {
        table: "challenge_participants",
        columns: "user_id",
        in: { column: "user_id", values: chunk },
      }),
    ),
  );
  for (const { data: joinData } of joinResults) {
    for (const j of joinData || []) {
      joinMap[j.user_id] = (joinMap[j.user_id] || 0) + 1;
    }
  }
  return joinMap;
}

export function Users() {
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  // Debounce free-text search, resetting to page 0 on each new term.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      setSearchTerm(search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadPage(page, searchTerm);
  }, [page, searchTerm]);

  async function loadStats() {
    try {
      const [
        { count: totalUsers },
        { count: premiumCount },
        { data: walletTotals },
      ] = await Promise.all([
        adminDb("count", { table: "users" }),
        adminDb("count", {
          table: "users",
          gte: { subscription_end: new Date().toISOString() },
        }),
        adminDb("sum", {
          table: "wallet",
          columns: ["balance", "total_earned"],
        }),
      ]);
      setStats({
        totalUsers: totalUsers || 0,
        premiumCount: premiumCount || 0,
        totalWallet: walletTotals?.balance || 0,
        totalEarned: walletTotals?.total_earned || 0,
      });
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  async function loadPage(pageIndex: number, term: string) {
    setLoading(true);
    try {
      const searchParams = term
        ? { orLike: { columns: ["name", "phone", "city"], value: term } }
        : {};

      const [{ data }, { count }] = await Promise.all([
        adminDb("select", {
          table: "users",
          columns: USER_COLUMNS,
          order: { column: "created_at", ascending: false },
          limit: PAGE_SIZE,
          offset: pageIndex * PAGE_SIZE,
          ...searchParams,
        }),
        adminDb("count", { table: "users", ...searchParams }),
      ]);

      setTotalCount(count || 0);
      const joinMap = await fetchJoinCounts((data || []).map((u: any) => u.id));
      setRows((data || []).map((u: any) => mapUser(u, joinMap)));
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function refresh() {
    loadStats();
    loadPage(page, searchTerm);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const searchParams = searchTerm
        ? { orLike: { columns: ["name", "phone", "city"], value: searchTerm } }
        : {};

      const all: any[] = [];
      let offset = 0;
      const chunkSize = 1000;
      while (true) {
        const { data } = await adminDb("select", {
          table: "users",
          columns: USER_COLUMNS,
          order: { column: "created_at", ascending: false },
          limit: chunkSize,
          offset,
          ...searchParams,
        });
        all.push(...(data || []));
        if (!data || data.length < chunkSize) break;
        offset += chunkSize;
      }

      const joinMap = await fetchJoinCounts(all.map((u) => u.id));
      const mapped = all.map((u) => mapUser(u, joinMap));

      exportCsv(
        mapped.map((u) => ({
          id: u.id,
          name: u.name,
          phone: u.phone,
          age: u.age,
          city: u.city,
          gender: u.gender,
          language: u.language,
          upi_id: u.upi_id,
          wallet_balance: u.wallet_balance,
          total_earned: u.total_earned,
          total_withdrawn: u.total_withdrawn,
          challenge_count: u.join_count,
          created_at: u.created_at,
          is_subscribed: isSubscribed(u),
          subscription_end: u.subscription_end,
          trial_used: u.trial_used,
          coach_active: u.coach_active,
          fitness_goals: u.fitness_goals?.join(";") ?? "",
          height_cm: u.height_cm,
          weight_kg: u.weight_kg,
        })),
        "zelth_users",
      );
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Users</div>
          <div className="page-subtitle">
            All registered users, wallet, and subscription info
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={refresh}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download size={13} /> {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      <div
        className="stat-grid"
        style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 20 }}
      >
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value" style={{ color: "var(--blue)" }}>
            {stats?.totalUsers ?? "..."}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Premium Subscribers</div>
          <div className="stat-value" style={{ color: "var(--orange)" }}>
            {stats?.premiumCount ?? "..."}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Wallet Balance</div>
          <div
            className="stat-value"
            style={{ color: "var(--orange)", fontSize: 20 }}
          >
            ₹{(stats?.totalWallet ?? 0).toLocaleString("en-IN")}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Earned (All Time)</div>
          <div
            className="stat-value"
            style={{ color: "var(--green)", fontSize: 20 }}
          >
            ₹{(stats?.totalEarned ?? 0).toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      <div className="filters">
        <div style={{ position: "relative" }}>
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text3)",
            }}
          />
          <input
            className="input"
            style={{ width: 260, paddingLeft: 30 }}
            placeholder="Search name, phone, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ color: "var(--text3)", fontSize: 12 }}>
          {totalCount} users
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">Loading users...</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">👥</div>
            <div className="empty-text">No users found</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Challenges</th>
                  <th>Wallet</th>
                  <th>Total Earned</th>
                  <th>UPI ID</th>
                  <th>Subscription</th>
                  <th>Coach</th>
                  <th>Goal</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {u.name || (
                          <span style={{ color: "var(--text3)" }}>—</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text3)" }}>
                        {u.age ? `${u.age}y` : ""} {u.gender || ""}
                      </div>
                    </td>
                    <td className="mono">{u.phone}</td>
                    <td style={{ color: "var(--text2)" }}>{u.city || "—"}</td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>
                      {u.join_count}
                    </td>
                    <td
                      style={{
                        fontWeight: 600,
                        color:
                          u.wallet_balance > 0
                            ? "var(--green)"
                            : "var(--text2)",
                      }}
                    >
                      ₹{u.wallet_balance.toLocaleString("en-IN")}
                    </td>
                    <td style={{ color: "var(--orange)" }}>
                      ₹{u.total_earned.toLocaleString("en-IN")}
                    </td>
                    <td
                      className="mono"
                      style={{ color: "var(--text2)", fontSize: 11 }}
                    >
                      {u.upi_id || "—"}
                    </td>
                    <td>
                      {isSubscribed(u) ? (
                        <>
                          <span className="badge badge-verified">Premium</span>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--text3)",
                              marginTop: 2,
                            }}
                          >
                            until{" "}
                            {new Date(u.subscription_end!).toLocaleDateString(
                              "en-IN",
                            )}
                          </div>
                        </>
                      ) : (
                        <span
                          className="badge"
                          style={{
                            background: "var(--bg3)",
                            color: "var(--text3)",
                          }}
                        >
                          Free
                        </span>
                      )}
                    </td>
                    <td>
                      {u.coach_active ? (
                        <span style={{ color: "var(--green)", fontSize: 12 }}>
                          ✅ Active
                        </span>
                      ) : isSubscribed(u) ? (
                        <span style={{ color: "var(--orange)", fontSize: 12 }}>
                          ⏳ Pending
                        </span>
                      ) : (
                        <span style={{ color: "var(--text3)" }}>—</span>
                      )}
                    </td>
                    <td style={{ color: "var(--text2)", fontSize: 12 }}>
                      {u.fitness_goals?.[0]
                        ? GOAL_LABELS[u.fitness_goals[0]] || u.fitness_goals[0]
                        : "—"}
                    </td>
                    <td style={{ color: "var(--text3)", fontSize: 11 }}>
                      {new Date(u.created_at).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 12,
          }}
        >
          <span style={{ color: "var(--text3)", fontSize: 12 }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft size={13} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
