import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { id: "/", name: "CapFootBall — Kết nối đam mê", short_name: "CapFootBall", description: "Tìm đối giao hữu bóng đá cùng trình độ, ngay gần bạn.", start_url: "/", display: "standalone", background_color: "#f7f8f5", theme_color: "#105941", lang: "vi", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
