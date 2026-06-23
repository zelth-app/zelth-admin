import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  CheckSquare,
  Wallet,
  Users,
  Trophy,
  Upload,
  LogOut,
  Bell,
  FileCheck,
  Tag,
  Dumbbell,
  Gift,
} from "lucide-react";

const links = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/submissions", icon: CheckSquare, label: "Submissions" },
  { to: "/bulk-verify", icon: FileCheck, label: "Bulk Verify" },
  { to: "/withdrawals", icon: Wallet, label: "Withdrawals" },
  { to: "/users", icon: Users, label: "Users" },
  { to: "/coach", icon: Dumbbell, label: "Coach" },
  { to: "/challenges", icon: Trophy, label: "Challenges" },
  { to: "/challenge-types", icon: Tag, label: "Challenge Types" },
  { to: "/prize-templates", icon: Gift, label: "Prize Templates" },
  { to: "/bulk-credit", icon: Upload, label: "Bulk Credit" },
  { to: "/notify", icon: Bell, label: "Notify" },
];

interface SidebarProps {
  onLogout: () => void;
}

export function Sidebar({ onLogout }: SidebarProps) {
  return (
    <aside
      style={{
        width: 220,
        minHeight: "100vh",
        background: "var(--bg2)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "0",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "24px 20px 20px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/logo.jpg"
            alt="Zelth"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              objectFit: "contain",
            }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Zelth</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>
              Admin Panel
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px" }}>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderRadius: "var(--radius)",
              marginBottom: 2,
              fontWeight: 500,
              fontSize: 13,
              color: isActive ? "var(--orange)" : "var(--text2)",
              background: isActive ? "rgba(245,166,35,0.1)" : "transparent",
              transition: "all 0.15s",
              textDecoration: "none",
            })}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div
        style={{ padding: "12px 10px", borderTop: "1px solid var(--border)" }}
      >
        <button
          className="btn btn-ghost"
          style={{ width: "100%", justifyContent: "flex-start" }}
          onClick={onLogout}
        >
          <LogOut size={14} /> Logout
        </button>
      </div>
    </aside>
  );
}
