export const SKILLS = ["WEAK", "BELOW_AVG", "AVERAGE", "ABOVE_AVG", "GOOD", "EXCELLENT"] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_LABELS: Record<Skill, string> = {
  WEAK: "Yếu", BELOW_AVG: "TB yếu", AVERAGE: "Trung bình", ABOVE_AVG: "TB khá", GOOD: "Khá", EXCELLENT: "Giỏi / Bán chuyên",
};
export const FORMATS = ["FIVE", "SEVEN", "ELEVEN"] as const;
export const FORMAT_LABELS = { FIVE: "Sân 5", SEVEN: "Sân 7", ELEVEN: "Sân 11" };
export const STATUS_LABELS: Record<string, string> = { OPEN: "Đang tìm đối", PENDING: "Chờ xác nhận", MATCHED: "Đã chốt kèo", CANCELLED: "Đã hủy", EXPIRED: "Đã hết hạn" };
export const REQUEST_LABELS: Record<string, string> = { PENDING: "Chờ xác nhận", ACCEPTED: "Đã chấp nhận", REJECTED: "Đã từ chối", CANCELLED: "Đã hủy" };
export const REQUEST_MESSAGES: Record<string, string> = { PENDING: "Đã gửi yêu cầu. Hãy trao đổi thêm với chủ kèo!", ACCEPTED: "Kèo đã chốt. Hẹn gặp trên sân!", REJECTED: "Kèo này chưa phù hợp. Hẹn bạn ở trận tiếp theo.", CANCELLED: "Yêu cầu đã hủy." };
export function skillRange(min?: Skill, max?: Skill) {
  return SKILLS.slice(min ? SKILLS.indexOf(min) : 0, max ? SKILLS.indexOf(max) + 1 : undefined);
}
