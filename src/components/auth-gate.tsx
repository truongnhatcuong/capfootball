"use client";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LogIn, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import type { Profile } from "@/types";
import { Loading, ErrorState } from "./ui";
export function AuthGate({ children, requireConsent = false }: { children: React.ReactNode; requireConsent?: boolean }) {
  const { data: session, status } = useSession();
  const me = useQuery({ queryKey: ["me", session?.user?.id], queryFn: () => api<Profile>("/api/me"), enabled: !!session?.user });
  if (status === "loading") return <Loading />;
  if (!session) return <div className="auth-card panel"><LogIn size={32} /><h1>Hẹn bạn trên sân!</h1><p className="muted">Đăng nhập để đăng kèo, trò chuyện và kết nối với các đội bóng.</p><Link href="/login" className="button">Đăng nhập với Google</Link></div>;
  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorState error={me.error} retry={() => void me.refetch()} />;
  if (requireConsent && !me.data?.termsAcceptedAt) return <div className="auth-card panel"><ShieldCheck size={32} /><h1>Hoàn tất hồ sơ</h1><p className="muted">Đọc và đồng ý Điều khoản cùng Chính sách quyền riêng tư trước khi đăng kèo hoặc trò chuyện.</p><Link className="button" href="/profile">Đi tới hồ sơ</Link></div>;
  return children;
}
