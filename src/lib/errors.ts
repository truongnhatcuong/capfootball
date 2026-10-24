import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "./logger";
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function assert(condition: unknown, status: number, code: string, message: string): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
export function errorResponse(error: unknown, requestId: string) {
  let status = 500, code = "INTERNAL_ERROR", message = "Có lỗi xảy ra. Vui lòng thử lại.";
  if (error instanceof AppError) ({ status, code, message } = error);
  else if (error instanceof ZodError) { status = 422; code = "VALIDATION_ERROR"; message = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "); }
  else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { status = 409; code = "CONFLICT"; message = "Dữ liệu đã tồn tại. Vui lòng tải lại trang."; }
  else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { status = 404; code = "NOT_FOUND"; message = "Không tìm thấy dữ liệu."; }
  else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") { status = 409; code = "IN_USE"; message = "Dữ liệu đang được sử dụng hoặc tham chiếu không hợp lệ."; }
  else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") { status = 409; code = "CONFLICT"; message = "Dữ liệu vừa thay đổi. Vui lòng thử lại."; }
  else if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) { status = 503; code = "DATABASE_SCHEMA_NOT_READY"; message = "Cơ sở dữ liệu chưa được khởi tạo hoặc chưa cập nhật. Vui lòng thử lại sau."; }
  if (status >= 500) logger.error({
    requestId,
    errorType: error instanceof Error ? error.name : "unknown",
    ...(error instanceof Prisma.PrismaClientKnownRequestError ? { prismaCode: error.code, model: error.meta?.modelName } : {}),
    ...(error instanceof Prisma.PrismaClientInitializationError ? { prismaCode: error.errorCode } : {}),
  }, "Request failed");
  return Response.json({ error: { code, message }, requestId }, { status, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
}
