"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  MessageSquare,
  Plus,
  CircleUserRound,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/client";
import { useRealtime } from "@/hooks/use-realtime";
import { ProvincePicker } from "./province-picker";
import { Avatar } from "./ui";
export function Header() {
  const path = usePathname(),
    { data: session } = useSession(),
    client = useQueryClient();
  const unread = useQuery({
    queryKey: ["unread", session?.user?.id],
    queryFn: () => api<{ count: number }>("/api/notifications/unread-count"),
    enabled: !!session?.user,
    refetchInterval: 30000,
  });
  useRealtime(
    session?.user?.id ? `private-user-${session.user.id}` : undefined,
    "notification",
    () => {
      void client.invalidateQueries({ queryKey: ["unread"] });
      void client.invalidateQueries({ queryKey: ["notifications"] });
    },
  );
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Link href="/" className="brand">
            <span className="brand-icon">
              <Image
                src="/icons/logo.png"
                alt="CapFootBall Logo"
                width={42}
                height={42}
                priority
                className="brand-logo-img"
              />
            </span>
            <span>
              Cap<span className="brand-accent">FootBall</span>
              <small>KẾT NỐI ĐAM MÊ</small>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Điều hướng chính">
            <Link href="/" className={path === "/" ? "active" : ""}>
              Tìm kèo
            </Link>
            <Link
              href="/messages"
              className={path.startsWith("/messages") ? "active" : ""}
            >
              Tin nhắn
            </Link>
            <Link
              href="/profile"
              className={path.startsWith("/profile") ? "active" : ""}
            >
              Kèo của tôi
            </Link>
          </nav>
          <div className="header-actions">
            <ProvincePicker />
            <Link
              href="/notifications"
              className="icon-button notification-button"
              aria-label={`Thông báo${unread.data?.count ? `, ${unread.data.count} chưa đọc` : ""}`}
            >
              <Bell size={20} />
              {!!unread.data?.count && (
                <span className="notification-count">
                  {unread.data.count > 9 ? "9+" : unread.data.count}
                </span>
              )}
            </Link>
            <Link className="button small header-post" href="/matches/new">
              <Plus size={17} />
              Đăng kèo
            </Link>
            <Link
              className="icon-button"
              href={session ? "/profile" : "/login"}
              aria-label={session ? "Hồ sơ" : "Đăng nhập"}
            >
              {session?.user ? (
                <Avatar
                  name={session.user.name ?? null}
                  image={session.user.image}
                  size={30}
                />
              ) : (
                <CircleUserRound size={22} />
              )}
            </Link>
          </div>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Điều hướng điện thoại">
        <Link href="/" className={path === "/" ? "active" : ""}>
          <Trophy size={20} />
          Tìm kèo
        </Link>
        <Link href="/messages">
          <MessageSquare size={20} />
          Tin nhắn
        </Link>
        <Link href="/matches/new">
          <Plus size={20} />
          Đăng kèo
        </Link>
        <Link href={session ? "/profile" : "/login"}>
          {session?.user ? (
            <Avatar
              name={session.user.name ?? null}
              image={session.user.image}
              size={20}
            />
          ) : (
            <CircleUserRound size={20} />
          )}
          Cá nhân
        </Link>
      </nav>
    </>
  );
}
