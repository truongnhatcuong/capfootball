"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { MessageCircle } from "lucide-react";
import type { PublicUser, Page } from "@/types";
import { api, dateLabel } from "@/lib/client";
import { Avatar, Empty, ErrorState, Loading } from "./ui";
import { ReportButton } from "./report-button";
type Data = PublicUser & { province: { name: string } | null; zaloPhone: string | null; ratings: Page<{ id: string; stars: number; comment: string | null; createdAt: string; rater: { name: string | null } }> };
export function UserProfile({ id }: { id: string }) {
  const { data: session } = useSession();
  const query = useInfiniteQuery({ queryKey: ["public-user", id, session?.user?.id], initialPageParam: "", queryFn: ({ pageParam }) => api<Data>(`/api/users/${id}${pageParam ? `?cursor=${pageParam}` : ""}`), getNextPageParam: (p) => p.ratings.nextCursor || undefined, staleTime: 0, refetchInterval: 30000 });
  if (query.isPending) return <Loading />;
  if (query.error || !query.data) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const user = query.data.pages[0];
  return <div className="narrow"><section className="panel form-panel"><div className="row"><Avatar name={user.name} image={user.image} size={76} /><div><h1>{user.name}</h1><p className="muted">{user.province?.name} · Tham gia {dateLabel(user.createdAt)}</p></div></div><div className="reputation"><strong>{user.ratingAvg != null && user.ratingCount >= 3 ? `★ ${user.ratingAvg.toFixed(1)}` : "Mới tham gia"}</strong><span>{user.ratingCount} đánh giá</span></div>{user.noShowCount >= 3 && <p className="warning-text">Có {user.noShowCount} báo cáo bùng kèo được xác nhận trong 90 ngày gần đây.</p>}{user.zaloPhone ? <div className="info-box"><MessageCircle size={20} /><div><strong>Số điện thoại Zalo</strong><p><a href={`tel:${user.zaloPhone}`}>{user.zaloPhone}</a></p><a className="button secondary small" href={`https://zalo.me/${user.zaloPhone}`} target="_blank" rel="noopener noreferrer">Nhắn qua Zalo</a></div></div> : <p className="muted">Số Zalo chỉ hiển thị cho đối thủ đã chốt kèo khi người dùng cho phép chia sẻ.</p>}<ReportButton targetType="USER" targetId={id} /></section><h2 className="section-heading">Nhận xét từ đối thủ</h2>{!user.ratings.data.length ? <Empty title="Chưa có đánh giá" /> : <div className="panel">{query.data.pages.flatMap((p) => p.ratings.data).map((r) => <div className="review-item" key={r.id}><div className="row between"><strong>{r.rater.name}</strong><span className="stars">{"★".repeat(r.stars)}</span></div>{r.comment && <p>{r.comment}</p>}<div className="row between"><small className="muted">{dateLabel(r.createdAt)}</small><ReportButton targetType="RATING" targetId={r.id} /></div></div>)}</div>}{query.hasNextPage && <button className="button secondary load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Xem thêm đánh giá</button>}</div>;
}
