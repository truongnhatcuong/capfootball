"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, json } from "@/lib/client";
import { vietQrImageUrl, type VietQrBank } from "@/lib/vietqr";
import { ErrorState, Field, Loading } from "./ui";

type Donate = { enabled: boolean; message: string; bankBin: string | null; accountNo: string | null; momoQrUrl: string | null; paypalUrl: string | null };

export function AdminDonate() {
  const query = useQuery({ queryKey: ["admin", "donate"], queryFn: () => api<Donate | null>("/api/admin/donate") });
  return (
    <div className="ad-narrow">
      <header className="ad-head"><div><h1>Cấu hình ủng hộ</h1><p>Nút ủng hộ chỉ hiển thị khi được bật và có thông tin nhận tiền.</p></div></header>
      {query.isPending ? <Loading /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : <DonateForm initial={query.data ?? null} />}
    </div>
  );
}

function DonateForm({ initial }: { initial: Donate | null }) {
  const client = useQueryClient();
  const [bankBin, setBankBin] = useState(initial?.bankBin ?? "");
  const [accountNo, setAccountNo] = useState(initial?.accountNo ?? "");
  const banks = useQuery({ queryKey: ["vietqr-banks"], queryFn: () => api<{ data: VietQrBank[] }>("/api/banks"), staleTime: 86400000 });
  const save = useMutation({
    mutationFn: (data: unknown) => api("/api/admin/donate", json("PUT", data)),
    meta: { successMessage: "Đã lưu cấu hình ủng hộ." },
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["donate"] }); void client.invalidateQueries({ queryKey: ["admin", "donate"] }); },
  });
  const selectedBank = banks.data?.data.find((bank) => bank.bin === bankBin);
  const qr = vietQrImageUrl(bankBin, accountNo.trim());
  return (
    <form className="ad-card ad-form" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      save.mutate({ enabled: form.get("enabled") === "on", message: form.get("message"), bankBin: bankBin || null, accountNo: accountNo.trim() || null, momoQrUrl: form.get("momoQrUrl") || null, paypalUrl: form.get("paypalUrl") || null });
    }}>
      <label className="ad-switch"><input type="checkbox" name="enabled" defaultChecked={initial?.enabled} /><span className="ad-switch-ui" aria-hidden="true" /><span>Bật nút ủng hộ</span></label>
      <Field label="Lời nhắn"><input name="message" required defaultValue={initial?.message ?? "Ủng hộ để CapFootBall duy trì miễn phí"} maxLength={250} /></Field>
      <div className="ad-form-grid">
        <Field label="Ngân hàng">
          <select name="bankBin" value={bankBin} onChange={(event) => setBankBin(event.target.value)} required={!!accountNo.trim()} disabled={banks.isPending && !bankBin}>
            <option value="">{banks.isPending ? "Đang tải ngân hàng..." : "Chọn ngân hàng"}</option>
            {bankBin && !selectedBank && <option value={bankBin}>Ngân hàng đã lưu</option>}
            {banks.data?.data.map((bank) => <option value={bank.bin} key={bank.bin}>{bank.shortName} — {bank.name}</option>)}
          </select>
        </Field>
        <Field label="Số tài khoản"><input name="accountNo" value={accountNo} onChange={(event) => setAccountNo(event.target.value)} inputMode="numeric" pattern="[0-9]{4,30}" minLength={4} maxLength={30} required={!!bankBin} placeholder="Nhập số tài khoản nhận tiền" /></Field>
      </div>
      {banks.error && <ErrorState error={banks.error} retry={() => void banks.refetch()} />}
      {qr && <div className="info-box"><div><strong>VietQR {selectedBank?.shortName ?? "chuyển khoản"}</strong><img className="donate-qr" src={qr} alt="Xem trước mã VietQR nhận ủng hộ" /></div></div>}
      <Field label="URL ảnh QR MoMo (HTTPS)"><input name="momoQrUrl" type="url" defaultValue={initial?.momoQrUrl ?? ""} /></Field>
      <Field label="URL PayPal"><input name="paypalUrl" type="url" defaultValue={initial?.paypalUrl ?? ""} /></Field>
      <div className="ad-form-foot"><button className="ad-btn" disabled={save.isPending}>{save.isPending ? "Đang lưu..." : "Lưu cấu hình"}</button></div>
    </form>
  );
}
