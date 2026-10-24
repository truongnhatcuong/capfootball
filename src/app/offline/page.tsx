import Link from "next/link";
import { WifiOff } from "lucide-react";
export const dynamic = "force-static";
export default function Page() { return <div className="auth-card panel"><WifiOff size={44} /><h1>Tạm rời đường biên kết nối</h1><p className="muted">Bạn đang ngoại tuyến. Kết nối mạng trở lại để xem kèo và trò chuyện với đối thủ.</p><Link href="/" className="button">Thử kết nối lại</Link></div>; }
