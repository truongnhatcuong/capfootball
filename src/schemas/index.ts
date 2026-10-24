import { z } from "zod";
import { SKILLS, FORMATS } from "@/constants/skill";
export const skillSchema = z.enum(SKILLS);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const provinceCode = z.string().regex(/^\d{2}$/);
const matchFields = z.object({
  title: text(5, 120), description: text(0, 2000).optional(), teamName: text(0, 80).optional(),
  skill: skillSchema, skillMax: skillSchema.nullable().optional(), format: z.enum(FORMATS),
  kickoffAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  provinceCode, venueId: text(1, 100).nullable().optional(), venue: text(0, 150).optional(), address: text(0, 250).optional(),
  fee: z.number().int().min(0).max(100000000).nullable().optional(), suggestVenue: z.boolean().optional(),
});
export const matchSchema = matchFields.refine((m) => !m.skillMax || SKILLS.indexOf(m.skillMax) >= SKILLS.indexOf(m.skill), { message: "Trình độ tối đa phải lớn hơn hoặc bằng tối thiểu", path: ["skillMax"] }).refine((m) => m.venueId || m.venue, { message: "Vui lòng chọn hoặc nhập sân", path: ["venue"] }).refine((m) => m.kickoffAt.getTime() > Date.now() + 15 * 60_000, { message: "Giờ đá phải cách hiện tại ít nhất 15 phút", path: ["kickoffAt"] });
export const matchPatchSchema = matchFields.omit({ suggestVenue: true }).partial().extend({ status: z.literal("CANCELLED").optional() });
export const requestSchema = z.object({ note: text(0, 500).optional() });
export const requestActionSchema = z.object({ status: z.enum(["ACCEPTED", "REJECTED", "CANCELLED"]) });
export const messageSchema = z.object({ body: text(1, 1000) });
const phone = z.string().regex(/^(0[35789]\d{8}|84[35789]\d{8})$/, "Số điện thoại Việt Nam không hợp lệ");
export const profileSchema = z.object({
  name: text(2, 80).optional(), provinceCode: provinceCode.nullable().optional(),
  zaloPhone: z.union([phone, z.literal("")]).nullable().optional(),
  zaloConsent: z.boolean().optional(), acceptTerms: z.literal(true).optional(), emailNotifications: z.boolean().optional(),
});
export const venueSchema = z.object({
  name: text(3, 150), address: text(5, 250), provinceCode,
  lat: z.number().min(-90).max(90).nullable().optional(), lng: z.number().min(-180).max(180).nullable().optional(),
  formats: z.array(z.enum(FORMATS)).min(1).max(3), phone: z.union([phone, z.literal("")]).nullable().optional(),
  pricePerHour: z.number().int().min(0).max(100000000).nullable().optional(),
}).refine((v) => (v.lat == null) === (v.lng == null), { message: "Cần nhập cả vĩ độ và kinh độ" });
export const ratingSchema = z.object({ happened: z.boolean(), noShow: z.boolean().default(false), stars: z.number().int().min(1).max(5).nullable().optional(), comment: text(0, 500).optional() }).superRefine((r, ctx) => {
  if (r.happened && (!r.stars || r.noShow)) ctx.addIssue({ code: "custom", message: "Trận đã đá cần 1–5 sao và không được báo bùng kèo" });
  if (!r.happened && r.stars != null) ctx.addIssue({ code: "custom", message: "Trận không diễn ra không có điểm sao" });
  if (r.noShow && (!r.comment || r.comment.length < 10)) ctx.addIssue({ code: "custom", message: "Vui lòng ghi lý do bùng kèo ít nhất 10 ký tự" });
});
export const reportSchema = z.object({ targetType: z.enum(["MATCH", "USER", "MESSAGE", "RATING"]), targetId: text(1, 100), reason: text(10, 1000) });
export const donateSchema = z.object({ enabled: z.boolean(), message: text(1, 250), bankBin: z.string().regex(/^\d{6}$/).nullable(), accountNo: z.string().trim().regex(/^\d{4,30}$/).nullable(), accountName: text(1, 100).nullable().optional().default(null), momoPhone: z.union([phone, z.literal("")]).nullable().optional(), momoQrUrl: z.url().startsWith("https://").nullable().optional(), paypalUrl: z.url().regex(/^https:\/\/(www\.)?paypal\.(com|me)\//).nullable().optional() }).superRefine((value, ctx) => {
  if (!!value.bankBin !== !!value.accountNo) ctx.addIssue({ code: "custom", path: [value.bankBin ? "accountNo" : "bankBin"], message: "Cần chọn ngân hàng và nhập số tài khoản để tạo VietQR." });
  if (value.enabled && !(value.bankBin && value.accountNo) && !value.momoQrUrl && !value.paypalUrl) ctx.addIssue({ code: "custom", path: ["bankBin"], message: "Hãy thêm thông tin nhận ủng hộ trước khi bật nút ủng hộ." });
});
export const pushSchema = z.object({ endpoint: z.url().startsWith("https://"), keys: z.object({ p256dh: text(20, 200), auth: text(10, 100) }) });
