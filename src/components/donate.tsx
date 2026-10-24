"use client";
import { toast } from "@/stores/toast.store";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coffee, Copy } from "lucide-react";
import { api } from "@/lib/client";
import { Modal } from "./ui";
import { vietQrImageUrl, type VietQrBank } from "@/lib/vietqr";
import styles from "./donate.module.css";
type Config = { enabled: boolean; message: string; bankBin: string | null; accountNo: string | null; momoQrUrl: string | null; paypalUrl: string | null };
export function DonateButton({ placement = "floating" }: { placement?: "floating" | "homepage" }) {
  const [open, setOpen] = useState(false), [copied, setCopied] = useState(false);
  const { data } = useQuery({ queryKey: ["donate"], queryFn: () => api<Config | null>("/api/donate"), staleTime: 300000 });
  const banks = useQuery({ queryKey: ["vietqr-banks"], queryFn: () => api<{ data: VietQrBank[] }>("/api/banks"), enabled: open && !!data?.bankBin, staleTime: 86400000 });
  if (!data?.enabled || !(data.bankBin && data.accountNo || data.momoQrUrl || data.paypalUrl)) return null;
  const qr = vietQrImageUrl(data.bankBin, data.accountNo) ?? data.momoQrUrl;
  const bankName = banks.data?.data.find((bank) => bank.bin === data.bankBin)?.shortName ?? "Chuyển khoản ngân hàng";
  const trigger = placement === "homepage" ? (
    <section className={styles.banner} aria-label="Ủng hộ CapFootBall">
      <span className={styles.icon} aria-hidden="true"><Coffee size={25} /></span>
      <div className={styles.copy}><h2>Chung tay giữ sân chơi miễn phí</h2><p>{data.message}</p></div>
      <button type="button" className={`button ${styles.button}`} aria-haspopup="dialog" onClick={() => setOpen(true)}><Coffee size={17} />Ủng hộ</button>
    </section>
  ) : <button type="button" className="donate-button" aria-haspopup="dialog" onClick={() => setOpen(true)}><Coffee size={17} />Ủng hộ</button>;
  return <>{trigger}<Modal open={open} onClose={() => setOpen(false)} title="Một ly cà phê cho sân cỏ"><p>{data.message}</p>{qr && <img className="donate-qr" src={qr} alt="Mã QR chuyển khoản ủng hộ CapFootBall" />}{data.accountNo && <div className="row between"><div><strong>{bankName}</strong><p>{data.accountNo}</p></div><button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(data.accountNo!); setCopied(true); toast.success("Đã sao chép số tài khoản."); } catch { setCopied(false); toast.error("Không thể sao chép. Vui lòng thử lại."); } }}><Copy size={16} />{copied ? "Đã sao chép" : "Sao chép"}</button></div>}{data.paypalUrl && <a className="button full" href={data.paypalUrl} target="_blank" rel="noopener noreferrer">Ủng hộ qua PayPal</a>}<small className="muted">Tự nguyện, giúp cộng đồng duy trì miễn phí.</small></Modal></>;
}
