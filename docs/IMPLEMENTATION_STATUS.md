# Trạng thái triển khai

Ngày 23/10/2026. Đây là mã nguồn ứng dụng được triển khai từ `SYSTEM_DESIGN.md`, chưa có deployment production hay dịch vụ bên ngoài được cấu hình.

## Đã có mã nguồn

| Phần | Nội dung |
| --- | --- |
| Khởi tạo | Next.js App Router, TypeScript, Tailwind, React Query, Zustand, Prisma/MySQL 8.4 |
| Dữ liệu | Schema, migration ban đầu, constraints bảo vệ bất biến, seed 34 tỉnh/thành |
| Kèo | Danh sách/lọc/tìm kiếm/phân trang, đăng/sửa/hủy, trang chi tiết, lịch sử cá nhân |
| Tài khoản | Auth.js Google, session DB, bootstrap admin, consent, hồ sơ, ẩn danh hóa khi xóa |
| Nhận kèo | Request riêng, kiểm quyền chủ kèo, khóa MySQL 8.4 khi chốt, tự từ chối yêu cầu khác |
| Chat | Hội thoại có thành viên, lịch sử/phân trang, chưa đọc, polling, adapter Pusher |
| Quyền riêng tư | Public user projection, Zalo chỉ cho đối tác đã chốt có consent, API private no-store |
| Sân bóng | Danh mục, gợi ý chờ duyệt, bản đồ Leaflet/OSM, admin sửa/duyệt/import CSV |
| Thông báo | DB + chuông, email Nodemailer SMTP tùy cấu hình, push tùy cấu hình, cron hết hạn/nhắc/đánh giá |
| Uy tín | Đánh giá hai bên sau 3 tiếng, sửa 24 giờ, phản bác no-show 72 giờ, tranh chấp và admin xử lý |
| Quản trị | Dashboard, người dùng, kèo, báo cáo, tỉnh, sân, đánh giá, donate, audit log |
| PWA | Manifest/icons, Serwist, offline fallback, install prompt, update prompt, push settings |
| Vận hành | Dockerfile, Compose dev, một workflow deploy trực tiếp VPS, migration/health check |

## Kiểm tra thực tế trong môi trường hiện tại

- Prisma schema: **hợp lệ** (Prisma CLI 6.19.3 có sẵn trên máy).
- Prisma Client: **sinh thành công** vào `node_modules` của dự án.
- Migration SQL: **sinh từ schema** bằng Prisma; thêm functional unique index MySQL và CHECK constraints trong migration thứ hai.
- Unit test miền nghiệp vụ: **11/11 đạt**, chạy bản JavaScript được biên dịch ngoại tuyến từ chính các test TypeScript.
- Kiểm tra cú pháp TypeScript/TSX: **đạt** qua `scripts/check-offline.mjs`.
- ESLint: **0 lỗi, 0 cảnh báo**, dùng ESLint/config Next.js có sẵn trên máy; cần chạy lại với dependency graph đã khóa của dự án.
- Cấu hình deploy hiện tại: `.github/workflows/deploy.yml`; xem `DEPLOYMENT.md`.
- Production dùng Docker CLI trực tiếp trong workflow; database/Redis và reverse proxy dùng kết nối hiện có của VPS.
- Kiểm tra shell deploy bằng `bash -n` và các test tình huống lỗi trong `tests/deploy`.
- Dependency install: **chưa thành công**. Truy cập npm bị môi trường từ chối (`EACCES`), offline cache thiếu Auth.js, React Query và các thư viện khác.
- Typecheck đầy đủ, production build, test MySQL 8.4 và browser e2e: **chưa xác minh** vì thiếu dependencies; Docker daemon hiện không chạy.
- Lockfile: **chưa sinh** do chưa giải quyết được dependencies. Docker tạm dùng `--no-frozen-lockfile`; cần tạo/commit lockfile và đổi sang `--frozen-lockfile` sau lần cài thành công.

## Giới hạn cần hoàn thiện trước production

1. Cấp DB/Redis, Google OAuth, secrets, Pusher; chạy toàn bộ lint/typecheck/test/build và thử hai tài khoản thật. Các adapter ngoài chưa được kiểm thử với tài khoản dịch vụ thực tế.
2. Giao email/push hiện gửi sau khi lưu thông báo; chưa có hàng đợi outbox/retry bền vững. Notification trong web đã lưu, nhưng lỗi giao email/push không tự gửi lại. Email cho tin nhắn offline chưa được bật.
3. PWA có trang offline và tài nguyên tĩnh; chưa lưu bản sao các kèo vừa xem. Không cache dữ liệu cá nhân hoặc hội thoại.
4. Preview Vercel cần DB riêng và cấu hình Pusher riêng cho từng môi trường.
5. Sentry, uptime monitor, off-site backup mã hóa/retention và bài thử khôi phục thật chưa được kết nối. Script backup hiện chỉ tạo dump cục bộ.
6. Trang điều khoản/quyền riêng tư là bản dự thảo mô tả kỹ thuật. Cần thêm đơn vị vận hành, kênh hỗ trợ, lịch lưu dữ liệu và bản nội dung đã được rà soát.
7. UI có các thành phần React/CSS trong repo; chưa cài shadcn/ui, React Hook Form, TanStack Table hoặc Recharts. Những thư viện đó là lựa chọn gợi ý trong thiết kế; form/API vẫn validate bằng Zod, bảng admin và biểu đồ thống kê có sẵn.
8. E2E hiện bao phủ khu vực, mobile, trang công khai và chặn anonymous; luồng đăng nhập Google/nhận-chốt-chat đầy đủ chưa tự động hóa trên browser. Test tích hợp MySQL 8.4 cho các bất biến đã được viết, chưa chạy ở môi trường này.
