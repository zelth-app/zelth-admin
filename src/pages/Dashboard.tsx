import { useEffect, useState } from "react";
import { supabase, adminDb } from "../lib/supabase";
import {
  Users,
  Trophy,
  CheckSquare,
  Wallet,
  TrendingUp,
  Clock,
} from "lucide-react";

interface Stats {
  users: number;
  challenges: number;
  submissions: number;
  pending_submissions: number;
  withdrawals: number;
  total_wallet: number;
  total_earned: number;
  active_subscribers: number;
  pending_coach: number;
  total_revenue: number;
  today_revenue: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentSubs, setRecentSubs] = useState<any[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [usersRes, { count: challenges }, { data: walletData }] =
        await Promise.all([
          adminDb("count", { table: "users" }),
          supabase
            .from("challenges")
            .select("*", { count: "exact", head: true })
            .eq("is_active", true),
          supabase.from("wallet").select("balance, total_earned"),
        ]);

      const activeSubsRes = await adminDb("count", {
        table: "users",
        gte: { subscription_end: new Date().toISOString() },
      });
      const active_subscribers = activeSubsRes.count || 0;

      const pendingCoachRes = await adminDb("count", {
        table: "users",
        gte: { subscription_end: new Date().toISOString() },
        // Must match Coach.tsx's Pending Setup query — deliberately deactivated
        // users are not awaiting setup.
        filters: { coach_active: false, coach_deactivated: false },
      });
      const pending_coach = pendingCoachRes.count || 0;

      const submissionsRes = await adminDb("count", {
        table: "activity_submissions",
      });
      const submissions = submissionsRes.count || 0;

      const pendingSubsRes = await adminDb("count", {
        table: "activity_submissions",
        filters: { status: "submitted" },
      });
      const pending_submissions = pendingSubsRes.count || 0;

      const recentSubsRes = await adminDb("select", {
        table: "activity_submissions",
        columns:
          "id, status, submitted_at, users(name, phone), challenge_participants(challenges(title))",
        order: { column: "submitted_at", ascending: false },
        limit: 5,
      });
      const recentSubsData = recentSubsRes.data;

      const withdrawalsRes = await adminDb("count", {
        table: "withdrawal_requests",
        filters: { status: "pending" },
      });
      const withdrawals = withdrawalsRes.count || 0;

      const totalWallet = (walletData || []).reduce(
        (sum: number, w: any) => sum + Number(w.balance),
        0,
      );
      const totalEarned = (walletData || []).reduce(
        (sum: number, w: any) => sum + Number(w.total_earned),
        0,
      );

      let totalRevenue = 0;
      let todayRevenue = 0;
      try {
        const totalRevenueResult = await adminDb("select", {
          table: "orders",
          columns: "amount",
          filters: { status: "paid" },
        });
        const todayRevenueResult = await adminDb("select", {
          table: "orders",
          columns: "amount",
          filters: { status: "paid" },
          gte: {
            created_at: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
          },
        });
        totalRevenue = (totalRevenueResult?.data || []).reduce(
          (sum: number, o: any) => sum + Number(o.amount),
          0,
        );
        todayRevenue = (todayRevenueResult?.data || []).reduce(
          (sum: number, o: any) => sum + Number(o.amount),
          0,
        );
      } catch {
        // orders table unavailable — leave revenue at 0
      }

      setStats({
        users: usersRes.count || 0,
        challenges: challenges || 0,
        submissions: submissions || 0,
        pending_submissions: pending_submissions || 0,
        withdrawals: withdrawals || 0,
        total_wallet: totalWallet,
        total_earned: totalEarned,
        active_subscribers: active_subscribers || 0,
        pending_coach: pending_coach || 0,
        total_revenue: totalRevenue,
        today_revenue: todayRevenue,
      });
      setRecentSubs(recentSubsData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading">Loading dashboard...</div>;

  const statCards = [
    {
      label: "Total Users",
      value: stats?.users,
      icon: Users,
      color: "var(--blue)",
    },
    {
      label: "Total Revenue",
      value: `₹${stats?.total_revenue?.toLocaleString("en-IN")}`,
      icon: TrendingUp,
      color: "var(--green)",
    },
    {
      label: "Today's Revenue",
      value: `₹${stats?.today_revenue?.toLocaleString("en-IN")}`,
      icon: TrendingUp,
      color: "var(--orange)",
    },
    {
      label: "Active Challenges",
      value: stats?.challenges,
      icon: Trophy,
      color: "var(--orange)",
    },
    {
      label: "Pending Reviews",
      value: stats?.pending_submissions,
      icon: Clock,
      color: "var(--yellow)",
      alert: (stats?.pending_submissions || 0) > 0,
    },
    {
      label: "Total Submissions",
      value: stats?.submissions,
      icon: CheckSquare,
      color: "var(--green)",
    },
    {
      label: "Pending Withdrawals",
      value: stats?.withdrawals,
      icon: Wallet,
      color: "var(--purple)",
      alert: (stats?.withdrawals || 0) > 0,
    },
    {
      label: "Total Coins Earned",
      value: stats?.total_earned?.toLocaleString("en-IN"),
      icon: TrendingUp,
      color: "var(--green)",
    },
    {
      label: "Active Subscribers",
      value: stats?.active_subscribers,
      icon: Users,
      color: "var(--orange)",
    },
    {
      label: "Pending Coach Setup",
      value: stats?.pending_coach,
      icon: Clock,
      color: "var(--yellow)",
      alert: (stats?.pending_coach || 0) > 0,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Zelth operations overview</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          Refresh
        </button>
      </div>

      <div
        className="stat-grid"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {statCards.map(({ label, value, icon: Icon, color, alert }) => (
          <div
            key={label}
            className="stat-card"
            style={{ borderColor: alert ? "rgba(245,166,35,0.4)" : undefined }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text3)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                {label}
              </div>
              <div style={{ color, opacity: 0.7 }}>
                <Icon size={16} />
              </div>
            </div>
            <div className="stat-value" style={{ color, fontSize: 24 }}>
              {value}
            </div>
            {alert && (
              <div
                style={{ fontSize: 11, color: "var(--yellow)", marginTop: 4 }}
              >
                ⚠ Needs attention
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Recent Submissions */}
      <div className="card">
        <div
          style={{
            fontWeight: 600,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <CheckSquare size={15} color="var(--orange)" /> Recent Submissions
        </div>
        {recentSubs.length === 0 ? (
          <div className="empty">
            <div className="empty-text">No submissions yet</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Challenge</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recentSubs.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {(s.users as any)?.name || "—"}
                      </div>
                      <div className="mono" style={{ color: "var(--text3)" }}>
                        {(s.users as any)?.phone}
                      </div>
                    </td>
                    <td>
                      {(s.challenge_participants as any)?.challenges?.title ||
                        "—"}
                    </td>
                    <td>
                      <span className={`badge badge-${s.status}`}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--text2)" }}>
                      {new Date(s.submitted_at).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
