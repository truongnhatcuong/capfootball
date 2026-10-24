"use client";
import { useEffect, useId, useRef } from "react";
import { X, LoaderCircle, AlertCircle, SearchX } from "lucide-react";
export function Modal({ open, onClose, title, children, className = "" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => { const dialog = ref.current; if (open && !dialog?.open) dialog?.showModal(); else if (!open && dialog?.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={id} onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-inner"><div className="row between"><h2 id={id}>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={20} /></button></div>{children}</div></dialog>;
}
export function Loading({ text = "Đang tải..." }: { text?: string }) { return <div className="state" role="status"><LoaderCircle className="spin" size={24} /><span>{text}</span></div>; }
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) { return <div className="error-box" role="alert"><AlertCircle size={20} /><div><strong>{error instanceof Error ? error.message : "Không tải được dữ liệu."}</strong>{retry && <button className="text-button" onClick={retry}>Thử lại</button>}</div></div>; }
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) { return <div className="empty"><SearchX size={36} /><h3>{title}</h3>{children}</div>; }
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Avatar({ name, image, size = 36 }: { name: string | null; image?: string | null; size?: number }) { return image ? <img src={image} alt="" className="avatar" style={{ width: size, height: size }} referrerPolicy="no-referrer" /> : <span className="avatar" style={{ width: size, height: size }}>{(name ?? "?").split(" ").filter(Boolean).slice(-2).map((n) => n[0]).join("")}</span>; }
export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) { return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{action}</div>; }
