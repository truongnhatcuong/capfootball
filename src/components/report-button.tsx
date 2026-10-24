"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { api, json } from "@/lib/client";
import { Modal, Field } from "./ui";
export function ReportButton({ targetType, targetId }: { targetType: "MATCH" | "USER" | "MESSAGE" | "RATING"; targetId: string }) {
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (reason: string) => api("/api/reports", json("POST", { targetType, targetId, reason })),
    meta: { successMessage: "Đã gửi báo cáo. Quản trị viên sẽ xem xét." },
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <button className="text-button muted" onClick={() => { mutation.reset(); setOpen(true); }} aria-label="Báo cáo nội dung"><Flag size={14} />Báo cáo</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Báo cáo vi phạm">
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(String(new FormData(e.currentTarget).get("reason"))); }}>
          <Field label="Lý do báo cáo"><textarea name="reason" rows={4} required minLength={10} maxLength={1000} placeholder="Mô tả nội dung vi phạm (ít nhất 10 ký tự)" /></Field>
          <button className="button" disabled={mutation.isPending}>Gửi báo cáo</button>
        </form>
      </Modal>
    </>
  );
}
