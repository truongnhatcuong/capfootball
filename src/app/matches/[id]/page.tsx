import { MatchDetail } from "@/components/match-detail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <MatchDetail id={(await params).id} />; }
