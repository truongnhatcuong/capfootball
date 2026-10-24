"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Trophy, Flag, MapPin, Globe2, Star, HandHeart, ScrollText } from "lucide-react";

const groups = [
  { label: "Vận hành", items: [["", "Tổng quan", LayoutDashboard], ["matches", "Quản lý kèo", Trophy], ["reports", "Báo cáo vi phạm", Flag], ["ratings", "Đánh giá & tranh chấp", Star]] },
  { label: "Danh mục", items: [["users", "Người dùng", Users], ["venues", "Sân bóng", MapPin], ["provinces", "Tỉnh / thành phố", Globe2]] },
  { label: "Hệ thống", items: [["donate", "Cấu hình ủng hộ", HandHeart], ["audit-logs", "Nhật ký quản trị", ScrollText]] },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <aside className="ad-side">
      <svg className="ad-pitch" viewBox="0 0 240 320" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="12" y="12" width="216" height="296" rx="4" />
        <line x1="12" y1="160" x2="228" y2="160" />
        <circle cx="120" cy="160" r="42" />
        <circle cx="120" cy="160" r="3" fill="currentColor" />
        <rect x="64" y="12" width="112" height="48" />
        <rect x="64" y="260" width="112" height="48" />
      </svg>
      <div className="ad-brand">
        <span className="ad-brand-mark">C</span>
        <div>
          <strong>Điều hành sân cỏ</strong>
          <span>Khu vực quản trị</span>
        </div>
      </div>
      <nav aria-label="Quản trị" className="ad-nav">
        {groups.map((g) => (
          <div className="ad-nav-group" key={g.label}>
            <span className="ad-nav-label">{g.label}</span>
            {g.items.map(([path, label, Icon]) => {
              const href = `/admin${path ? `/${path}` : ""}`;
              const active = path ? pathname.startsWith(href) : pathname === "/admin";
              return (
                <Link href={href} key={href} className="ad-link" aria-current={active ? "page" : undefined}>
                  <Icon size={17} strokeWidth={active ? 2.3 : 1.9} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
