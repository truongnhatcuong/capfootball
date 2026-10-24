import { redirect } from "next/navigation";
import { Be_Vietnam_Pro, Barlow_Condensed } from "next/font/google";
import { requireAdmin } from "@/lib/guards";
import { AdminNav } from "@/components/admin-nav";
import "./admin.css";
export const dynamic = "force-dynamic";
const ui = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--ad-font-ui", display: "swap" });
const score = Barlow_Condensed({ subsets: ["latin", "vietnamese"], weight: ["500", "600", "700"], variable: "--ad-font-score", display: "swap" });
export default async function Layout({ children }: { children: React.ReactNode }) {
  try { await requireAdmin(); } catch { redirect("/login?callbackUrl=/admin"); }
  return <div className={`admin-layout ${ui.variable} ${score.variable}`}><AdminNav /><section className="ad-main">{children}</section></div>;
}
