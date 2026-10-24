"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="auth-card panel"><h1>Có lỗi khi tải trang</h1><p className="muted">Vui lòng thử lại sau ít phút.</p><button className="button" onClick={reset}>Thử lại</button></div>; }
