import { auth } from "./auth";
import { prisma } from "./prisma";
import { assert } from "./errors";
export async function requireUser(write = false) {
  const session = await auth();
  assert(session?.user?.id, 401, "UNAUTHORIZED", "Vui lòng đăng nhập để tiếp tục.");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  assert(user && !user.deletedAt && user.status === "ACTIVE", 403, "ACCOUNT_DISABLED", "Tài khoản đã bị khóa hoặc đã xóa.");
  if (write) assert(user.termsAcceptedAt, 403, "CONSENT_REQUIRED", "Vui lòng đồng ý Điều khoản và Chính sách trong Hồ sơ.");
  return user;
}
export async function requireAdmin() {
  const user = await requireUser();
  assert(user.role === "ADMIN", 403, "FORBIDDEN", "Chỉ quản trị viên được truy cập.");
  return user;
}
