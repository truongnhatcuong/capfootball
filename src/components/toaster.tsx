"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { toast, useToastStore, type Toast } from "@/stores/toast.store";
import styles from "./toaster.module.css";

function subscribeToDialogs(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
  return () => observer.disconnect();
}
function getContainer() {
  const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  return dialogs.item(dialogs.length - 1) ?? document.body;
}

function ToastItem({ item }: { item: Toast }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => toast.dismiss(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [item.id, paused]);
  const Icon = item.type === "success" ? CheckCircle2 : item.type === "error" ? CircleAlert : Info;
  return (
    <li
      className={`${styles.item} ${styles[item.type]}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
    >
      <Icon className={styles.icon} size={21} aria-hidden="true" />
      <span className={styles.message} role={item.type === "error" ? "alert" : "status"}>{item.message}</span>
      <button type="button" className={styles.close} aria-label="Đóng thông báo" onClick={() => toast.dismiss(item.id)}><X size={16} /></button>
    </li>
  );
}

export function Toaster() {
  const items = useToastStore((state) => state.items);
  // Native dialogs occupy the top layer. Render inside the open dialog so toasts stay visible and interactive.
  const container = useSyncExternalStore(subscribeToDialogs, getContainer, () => null);
  if (!container || !items.length) return null;
  return createPortal(
    <ol className={styles.viewport} aria-label="Thông báo thao tác">
      {items.map((item) => <ToastItem item={item} key={item.id} />)}
    </ol>,
    container,
  );
}
