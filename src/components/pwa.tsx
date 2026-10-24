"use client";
import { toast } from "@/stores/toast.store";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, X, Bell } from "lucide-react";
import { api, json } from "@/lib/client";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null), [dismissed, setDismissed] = useState(false), [update, setUpdate] = useState<ServiceWorker | null>(null);
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  const ios = hydrated && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;
  const previouslyDismissed = hydrated && localStorage.getItem("capfootball-install-dismissed") === "1";
  useEffect(() => {
    const listener = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", listener);
    let active = true;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") void navigator.serviceWorker.ready.then((registration) => {
      if (!active) return;
      if (registration.waiting) setUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => { const worker = registration.installing; worker?.addEventListener("statechange", () => { if (active && worker.state === "installed" && navigator.serviceWorker.controller) setUpdate(worker); }); });
    });
    return () => { active = false; window.removeEventListener("beforeinstallprompt", listener); };
  }, []);
  if (update) return <div className="install-banner"><span>Có bản mới của CapFootBall.</span><button onClick={() => { navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true }); update.postMessage({ type: "SKIP_WAITING" }); }}>Tải lại</button></div>;
  if (dismissed || previouslyDismissed || (!event && !ios)) return null;
  return <div className="install-banner"><Download size={20} /><span>{ios ? "Cài ứng dụng: Chia sẻ → Thêm vào Màn hình chính" : "Mang sân cỏ theo bạn. Cài CapFootBall!"}</span>{event && <button onClick={async () => { await event.prompt(); const choice = await event.userChoice; if (choice.outcome === "accepted") setDismissed(true); setEvent(null); }}>Cài đặt</button>}<button aria-label="Ẩn gợi ý cài đặt" onClick={() => { localStorage.setItem("capfootball-install-dismissed", "1"); setDismissed(true); }}><X size={16} /></button></div>;
}
function toBytes(base64: string) { const raw = atob(base64.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); }
export function PushSettings() {
  const [busy, setBusy] = useState(false);
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return null;
  async function toggle(enable: boolean) {
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Trình duyệt chưa hỗ trợ. Trên iPhone, hãy thêm ứng dụng vào Màn hình chính.");
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) throw new Error("Ứng dụng chưa sẵn sàng nhận thông báo. Hãy tải lại trang.");
      let subscription = await registration.pushManager.getSubscription();
      if (enable) {
        if (await Notification.requestPermission() !== "granted") throw new Error("Hãy cho phép thông báo trong cài đặt trình duyệt.");
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) });
        await api("/api/push/subscribe", json("POST", subscription.toJSON())); toast.success("Đã bật thông báo trên thiết bị này.");
      } else if (subscription) {
        await api("/api/push/subscribe", json("DELETE", { endpoint: subscription.endpoint })); await subscription.unsubscribe(); toast.success("Đã tắt thông báo trên thiết bị này.");
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Không thể cập nhật thông báo."); } finally { setBusy(false); }
  }
  return <div className="push-settings"><h3><Bell size={17} />Thông báo trên thiết bị</h3><div className="row"><button className="text-button" disabled={busy} onClick={() => void toggle(true)}>Bật thông báo</button><button className="text-button muted" disabled={busy} onClick={() => void toggle(false)}>Tắt</button></div></div>;
}
