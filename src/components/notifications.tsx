"use client";
import { toast } from "@/stores/toast.store";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { api, json, dateLabel, timeLabel } from "@/lib/client";
import type { Notification, Page } from "@/types";
import { AuthGate } from "./auth-gate";
import { PageHeading, Empty, ErrorState, Loading } from "./ui";
export function Notifications() { return <AuthGate><NotificationContent /></AuthGate>; }
function NotificationContent() {
  const { data: session } = useSession(), client = useQueryClient();
  const query = useInfiniteQuery({ queryKey: ["notifications", session?.user?.id], initialPageParam: "", queryFn: ({ pageParam }) => api<Page<Notification>>(`/api/notifications${pageParam ? `?cursor=${pageParam}` : ""}`), getNextPageParam: (p) => p.nextCursor || undefined, refetchInterval: 30000 });
  const read = useMutation({ mutationFn: (ids?: string[]) => api("/api/notifications/read", json("POST", { ids })), onSuccess: (_data, ids) => { if (!ids) toast.success("Đã đánh dấu tất cả thông báo là đã đọc."); void client.invalidateQueries({ queryKey: ["notifications"] }); void client.invalidateQueries({ queryKey: ["unread"] }); } });
  return <div className="narrow"><PageHeading title="Thông báo" description="Không bỏ lỡ lời mời ra sân nào." action={<button className="text-button" disabled={read.isPending} onClick={() => read.mutate(undefined)}><CheckCheck size={17} />Đọc tất cả</button>} />{query.isPending ? <Loading /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : !query.data?.pages[0].data.length ? <Empty title="Bạn đã cập nhật mọi thứ"><p className="muted">Thông báo mới sẽ xuất hiện ở đây.</p></Empty> : <div className="panel notifications-list">{query.data.pages.flatMap((p) => p.data).map((n) => <Link href={n.url?.startsWith("/") && !n.url.startsWith("//") ? n.url : "/notifications"} key={n.id} className={`notification-item ${!n.readAt ? "unread" : ""}`} onClick={() => { if (!n.readAt) read.mutate([n.id]); }}><span className="notification-icon"><Bell size={19} /></span><div><strong>{n.title}</strong>{n.body && <p>{n.body}</p>}<small>{timeLabel(n.createdAt)} · {dateLabel(n.createdAt)}</small></div>{!n.readAt && <span className="status-dot" />}</Link>)}</div>}{query.hasNextPage && <button className="button secondary load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Thông báo trước đó</button>}</div>;
}
