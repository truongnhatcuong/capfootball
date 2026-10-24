import { notFound } from "next/navigation";
import { AdminPanel, AdminDonate } from "@/components/admin-panel";
export default async function Page({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  if (resource === "donate") return <AdminDonate />;
  if (!["users", "matches", "reports", "venues", "provinces", "ratings", "audit-logs"].includes(resource)) notFound();
  return <AdminPanel resource={resource} />;
}
