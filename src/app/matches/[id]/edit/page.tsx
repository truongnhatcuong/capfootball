import { MatchForm } from "@/components/match-form";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <MatchForm id={(await params).id} />; }
