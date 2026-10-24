import { UserProfile } from "@/components/user-profile";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <UserProfile id={(await params).id} />; }
