import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
export async function proxy(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login?callbackUrl=/admin", request.url));
  if (session.user.role !== "ADMIN") return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/admin/:path*"] };
