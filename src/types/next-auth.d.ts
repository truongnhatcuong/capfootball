import type { DefaultSession } from "next-auth";
import "@auth/core/adapters";
declare module "next-auth" {
  interface Session { user: { id: string; role: "USER" | "ADMIN" } & DefaultSession["user"] }
}
declare module "@auth/core/adapters" { interface AdapterUser { role: "USER" | "ADMIN" } }
