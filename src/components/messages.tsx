"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, MessageSquare, Ban } from "lucide-react";
import { api, json, timeLabel, dateLabel } from "@/lib/client";
import { useRealtime } from "@/hooks/use-realtime";
import type { ChatMessage, Conversation, Page } from "@/types";
import { AuthGate } from "./auth-gate";
import { Avatar, Empty, ErrorState, Loading, PageHeading, Modal } from "./ui";
import { ReportButton } from "./report-button";
export function Messages({ id }: { id?: string }) {
  return (
    <AuthGate>
      <MessagesContent id={id} />
    </AuthGate>
  );
}
function MessagesContent({ id }: { id?: string }) {
  const { data: session } = useSession(),
    userId = session?.user?.id,
    client = useQueryClient();
  const [body, setBody] = useState(""),
    [blockOpen, setBlockOpen] = useState(false),
    end = useRef<HTMLDivElement>(null);
  const list = useInfiniteQuery({
    queryKey: ["conversations", userId],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<Page<Conversation>>(
        `/api/conversations?limit=25${pageParam ? `&cursor=${pageParam}` : ""}`,
      ),
    getNextPageParam: (p) => p.nextCursor || undefined,
    refetchInterval: 15000,
  });
  const messages = useInfiniteQuery({
    queryKey: ["messages", id, userId],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<Page<ChatMessage> & { conversation: Conversation }>(
        `/api/conversations/${id}/messages?limit=30${pageParam ? `&cursor=${pageParam}` : ""}`,
      ),
    getNextPageParam: (p) => p.nextCursor || undefined,
    enabled: !!id,
    refetchInterval: 5000,
  });
  useRealtime(id ? `private-conv-${id}` : undefined, "message", () => {
    void client.invalidateQueries({ queryKey: ["messages", id] });
    void client.invalidateQueries({ queryKey: ["conversations"] });
  });
  const rows =
    messages.data?.pages
      .flatMap((p) => p.data)
      .filter((m, i, all) => all.findIndex((v) => v.id === m.id) === i)
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      ) ?? [];
  const latestId = rows.at(-1)?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [latestId, id]);
  const send = useMutation({
    mutationFn: (text: string) =>
      api<ChatMessage>(
        `/api/conversations/${id}/messages`,
        json("POST", { body: text }),
      ),
    onSuccess: () => {
      setBody("");
      void client.invalidateQueries({ queryKey: ["messages", id] });
      void client.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const conversation = messages.data?.pages[0]?.conversation;
  const partner = conversation?.members.find((m) => m.userId !== userId)?.user;
  const block = useMutation({ meta: { successMessage: "Đã chặn người dùng. Bạn có thể bỏ chặn trong hồ sơ." },
    mutationFn: () => api("/api/blocks", json("POST", { userId: partner?.id })),
    onSuccess: () => setBlockOpen(false),
  });
  return (
    <>
      <PageHeading
        eyebrow="GIỮ KẾT NỐI"
        title="Tin nhắn"
        description="Trao đổi với đối thủ, thống nhất một trận cầu đẹp."
      />
      <div className={`messages-layout panel ${id ? "has-conversation" : ""}`}>
        <aside className="conversation-list">
          <h2>Cuộc trò chuyện</h2>
          {list.isPending ? (
            <Loading />
          ) : list.error ? (
            <ErrorState error={list.error} retry={() => void list.refetch()} />
          ) : !list.data?.pages[0].data.length ? (
            <Empty title="Chưa có tin nhắn">
              <p>Nhận một kèo để bắt đầu trò chuyện.</p>
              <Link className="button small" href="/">
                Tìm kèo
              </Link>
            </Empty>
          ) : (
            list.data.pages
              .flatMap((p) => p.data)
              .map((c) => {
                const other = c.members.find((m) => m.userId !== userId)?.user;
                return (
                  <Link
                    href={`/messages/${c.id}`}
                    key={c.id}
                    className={`conversation-item ${c.id === id ? "selected" : ""}`}
                  >
                    <Avatar
                      name={other?.name ?? null}
                      image={other?.image}
                      size={42}
                    />
                    <span className="truncate">
                      <strong>{other?.name || "Thành viên"}</strong>
                      <small className="truncate">
                        {c.messages[0]?.body || c.match.title}
                      </small>
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="count-pill">{c.unreadCount}</span>
                    )}
                  </Link>
                );
              })
          )}
          {list.hasNextPage && (
            <button
              className="text-button"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              Xem thêm hội thoại
            </button>
          )}
        </aside>
        <section className="chat-main">
          {!id ? (
            <Empty title="Chọn cuộc trò chuyện">
              <MessageSquare size={30} />
              <p className="muted">
                Cùng trao đổi để chốt thời gian, sân bóng và phí sân.
              </p>
            </Empty>
          ) : messages.isPending ? (
            <Loading />
          ) : messages.error ? (
            <ErrorState
              error={messages.error}
              retry={() => void messages.refetch()}
            />
          ) : (
            <>
              <div className="chat-heading">
                <Link
                  className="mobile-only icon-button"
                  href="/messages"
                  aria-label="Danh sách trò chuyện"
                >
                  <ArrowLeft size={20} />
                </Link>

                {partner && (
                  <Link
                    className="text-button"
                    href={`/users/${partner.id}`}
                    aria-label={`Xem hồ sơ của ${partner.name || "đối thủ"}`}
                  >
                    <Avatar
                      name={partner?.name ?? null}
                      image={partner?.image}
                    />
                  </Link>
                )}
                <div className="grow">
                  <strong>{partner?.name}</strong>
                  <Link
                    className="muted truncate"
                    href={`/matches/${conversation?.match.id}`}
                  >
                    {conversation?.match.title}
                  </Link>
                </div>

                <button
                  className="icon-button"
                  aria-label="Chặn người dùng"
                  onClick={() => setBlockOpen(true)}
                >
                  <Ban size={18} />
                </button>
              </div>
              <div className="chat-scroll">
                {messages.hasNextPage && (
                  <button
                    className="text-button load-more"
                    disabled={messages.isFetchingNextPage}
                    onClick={() => void messages.fetchNextPage()}
                  >
                    Tin nhắn trước đó
                  </button>
                )}
                {!rows.length && (
                  <p className="chat-welcome">
                    Bắt đầu bằng một lời chào nhé! 👋
                  </p>
                )}
                {rows.map((m, i) => (
                  <div key={m.id}>
                    {(i === 0 ||
                      dateLabel(rows[i - 1].createdAt) !==
                        dateLabel(m.createdAt)) && (
                      <div className="message-date">
                        {dateLabel(m.createdAt)}
                      </div>
                    )}
                    <div
                      className={`message-line ${m.senderId === userId ? "mine" : ""}`}
                    >
                      <div className="message-bubble">
                        <p>{m.body}</p>
                        <small>{timeLabel(m.createdAt)}</small>
                      </div>
                      {m.senderId !== userId && (
                        <ReportButton targetType="MESSAGE" targetId={m.id} />
                      )}
                    </div>
                  </div>
                ))}
                <div ref={end} />
              </div>
              
              
              <form
                className="chat-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (body.trim()) send.mutate(body.trim());
                }}
              >
                <textarea
                  aria-label="Tin nhắn"
                  placeholder="Nhập tin nhắn..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  disabled={send.isPending}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      if (body.trim() && !send.isPending)
                        send.mutate(body.trim());
                    }
                  }}
                />
                <button
                  className="button"
                  type="submit"
                  disabled={send.isPending || !body.trim()}
                  aria-label="Gửi tin nhắn"
                >
                  <Send size={19} />
                </button>
              </form>
              <small className="chat-note">
                Thông tin Zalo xuất hiện ở trang kèo sau khi hai bên chốt.
              </small>
            </>
          )}
        </section>
      </div>
      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title="Chặn người dùng?"
      >
        <p>
          Hai bên sẽ không thể gửi tin nhắn hoặc nhận kèo của nhau. Bạn có thể
          bỏ chặn trong hồ sơ.
        </p>
        
        <button
          className="button danger-button"
          disabled={block.isPending}
          onClick={() => block.mutate()}
        >
          Chặn người dùng
        </button>
      </Modal>
    </>
  );
}
