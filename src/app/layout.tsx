import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { DonateButton } from "@/components/donate";
import { InstallPrompt } from "@/components/pwa";
import "./globals.css";
export const metadata: Metadata = { title: { default: "CapFootBall — Tìm đối, chốt kèo, ra sân", template: "%s | CapFootBall" }, description: "Kết nối đội bóng cùng khu vực, cùng trình độ. Tìm đối giao hữu, trò chuyện và chốt kèo bóng đá phong trào.", applicationName: "CapFootBall", appleWebApp: { capable: true, statusBarStyle: "default", title: "CapFootBall" }, icons: { apple: "/icons/icon-192.png" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#105941" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body><Providers><a className="skip-link" href="#main">Đi đến nội dung</a><Header /><main id="main" className="container main-content">{children}</main><footer className="site-footer"><div className="container footer-inner"><div><Link className="footer-brand" href="/"><Image src="/icons/logo.png" alt="Logo" width={24} height={24} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 8 }} />CapFootBall<span>●</span></Link><p>Kết nối đam mê. Lan tỏa tinh thần thể thao.</p></div><nav aria-label="Thông tin"><Link href="/terms">Điều khoản</Link><Link href="/privacy">Quyền riêng tư</Link><Link href="/data-deletion">Xóa dữ liệu</Link></nav><small>© {new Date().getFullYear()} CapFootBall</small></div></footer><DonateButton /><InstallPrompt /></Providers></body></html>;
}
