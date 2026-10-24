import { Messages } from "@/components/messages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <Messages id={(await params).id} />; }
