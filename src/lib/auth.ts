import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  providers: [Google],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, profile }) {
      if (profile?.email_verified !== true || !user.email) return false;
      const existing = await prisma.user.findUnique({ where: { email: user.email } });
      return !existing || (existing.status === "ACTIVE" && !existing.deletedAt);
    },
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.role = "role" in user && user.role === "ADMIN" ? "ADMIN" : "USER";
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.email && adminEmails().includes(user.email.toLowerCase())) {
        await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      }
    },
  },
});
