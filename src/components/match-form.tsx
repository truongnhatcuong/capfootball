"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, Info } from "lucide-react";
import { api, json } from "@/lib/client";
import { useRegionStore } from "@/stores/region.store";
import { SKILLS, SKILL_LABELS, FORMATS, FORMAT_LABELS } from "@/constants/skill";
import type { Province, Page, Venue, Match } from "@/types";
import { Field, ErrorState, PageHeading, Loading } from "./ui";
import { AuthGate } from "./auth-gate";
export function MatchForm({ id }: { id?: string }) {
  return <AuthGate requireConsent>{id ? <EditMatchLoader id={id} /> : <MatchFormContent />}</AuthGate>;
}
function EditMatchLoader({ id }: { id: string }) {
  const { data: session } = useSession();
  const query = useQuery({ queryKey: ["edit-match", id], queryFn: () => api<Match>("/api/matches/" + id) });
  if (query.isPending) return <Loading />;
  if (query.error || !query.data) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (query.data.ownerId !== session?.user?.id) return <ErrorState error={new Error("Chỉ chủ kèo được chỉnh sửa.")} />;
  return <MatchFormContent key={query.data.id} initial={query.data} />;
}
function MatchFormContent({ initial }: { initial?: Match }) {
  const region = useRegionStore(), router = useRouter();
  const [province, setProvince] = useState(initial?.provinceCode ?? region.provinceCode ?? ""), [format, setFormat] = useState(initial?.format ?? "SEVEN"), [venueId, setVenueId] = useState(initial?.venueRef?.id ?? ""), [skill, setSkill] = useState(initial?.skill ?? "AVERAGE"), [venueSearch, setVenueSearch] = useState("");
  const provinces = useQuery({ queryKey: ["provinces"], queryFn: () => api<{ data: Province[] }>("/api/provinces") });
  const venues = useQuery({ queryKey: ["venues", province, format, venueSearch], queryFn: () => api<Page<Venue>>(`/api/venues?province=${province}&format=${format}&q=${encodeURIComponent(venueSearch)}&limit=50`), enabled: !!province });
  const mutation = useMutation({ meta: { successMessage: initial ? "Đã cập nhật kèo." : "Đã đăng kèo thành công." }, mutationFn: (data: unknown) => api<Match>(initial ? "/api/matches/" + initial.id : "/api/matches", json(initial ? "PATCH" : "POST", data)), onSuccess: (match) => router.push(`/matches/${match.id}`) });
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    // datetime-local is deliberately interpreted as Vietnam time on every device.
    const kickoffAt = `${form.get("kickoffAt")}:00+07:00`;
    mutation.mutate({ title: form.get("title"), teamName: form.get("teamName"), skill, skillMax: form.get("skillMax") || null, format, kickoffAt, provinceCode: province, venueId: venueId || null, venue: form.get("venue") || undefined, address: form.get("address") || undefined, description: form.get("description"), suggestVenue: form.get("suggestVenue") === "on" });
  }
  return <div className="narrow"><PageHeading eyebrow="MỘT TRẬN ĐẤU MỚI" title={initial ? "Chỉnh sửa kèo" : "Đăng kèo tìm đối"} description="Một lời mời rõ ràng, một trận giao hữu trọn vẹn." /><form className="panel form-panel" onSubmit={submit}><div className="form-section-title"><span>01</span><h2>Đội bóng & trình độ</h2></div><Field label="Tiêu đề kèo *"><input name="title" defaultValue={initial?.title} required minLength={5} maxLength={120} placeholder="Ví dụ: FC Chủ Nhật tìm đối giao hữu tối thứ 7" /></Field><Field label="Tên đội"><input name="teamName" defaultValue={initial?.teamName ?? ""} maxLength={80} placeholder="Tên đội bóng của bạn (không bắt buộc)" /></Field><div className="form-grid"><Field label="Trình độ đội *"><select value={skill} onChange={(e) => setSkill(e.target.value as typeof skill)}>{SKILLS.map((s) => <option value={s} key={s}>{SKILL_LABELS[s]}</option>)}</select></Field><Field label="Chấp nhận đối thủ tối đa"><select name="skillMax" defaultValue={initial?.skillMax ?? ""}><option value="">Cùng trình độ</option>{SKILLS.filter((s) => SKILLS.indexOf(s) >= SKILLS.indexOf(skill as typeof SKILLS[number])).map((s) => <option value={s} key={s}>{SKILL_LABELS[s]}</option>)}</select></Field></div><div className="form-section-title"><span>02</span><h2>Thời gian & sân bóng</h2></div><div className="form-grid"><Field label="Tỉnh / thành phố *"><select required value={province} onChange={(e) => { setProvince(e.target.value); setVenueId(""); }}><option value="">Chọn tỉnh / thành phố</option>{provinces.data?.data.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></Field><Field label="Loại sân *"><select value={format} onChange={(e) => { setFormat(e.target.value as typeof format); setVenueId(""); }}>{FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}</select></Field></div>{provinces.error && <ErrorState error={provinces.error} retry={() => void provinces.refetch()} />}<Field label="Ngày & giờ đá *" hint="Giờ Việt Nam (UTC+7). Đăng trước giờ đá ít nhất 15 phút."><input type="datetime-local" name="kickoffAt" defaultValue={initial ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(initial.kickoffAt)).replace(" ", "T") : undefined} required /></Field><Field label="Tìm sân trong danh mục"><input value={venueSearch} onChange={(e) => setVenueSearch(e.target.value)} placeholder="Nhập tên sân..." disabled={!province} /></Field><Field label="Sân bóng *"><select value={venueId} onChange={(e) => setVenueId(e.target.value)} disabled={!province}><option value="">Sân khác — nhập thông tin bên dưới</option>{venues.data?.data.map((v) => <option value={v.id} key={v.id}>{v.name} · {v.address}</option>)}</select></Field>{venues.error && <ErrorState error={venues.error} retry={() => void venues.refetch()} />}{!venueId && <><Field label="Tên sân *"><input name="venue" defaultValue={initial?.venue ?? ""} required maxLength={150} placeholder="Tên sân bóng" /></Field><Field label="Địa chỉ sân"><input name="address" defaultValue={initial?.address ?? ""} maxLength={250} placeholder="Địa chỉ để đối thủ dễ tìm" /></Field><label className="checkbox"><input type="checkbox" name="suggestVenue" />Gợi ý sân này vào danh mục (chờ quản trị viên duyệt)</label></>}<div className="form-section-title"><span>03</span><h2>Thông tin thêm</h2></div><Field label="Lời nhắn gửi đối thủ"><textarea name="description" defaultValue={initial?.description ?? ""} rows={4} maxLength={2000} placeholder="Màu áo, mong muốn giao hữu, thông tin sân..." /></Field><div className="info-box"><Info size={18} /><span>Thông tin liên hệ Zalo chỉ được chia sẻ với đối thủ đã chốt kèo, theo lựa chọn trong hồ sơ của bạn.</span></div><button type="submit" className="button full" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu..." : initial ? "Lưu thay đổi" : "Đăng kèo ngay"}<ArrowRight size={18} /></button></form></div>;
}
