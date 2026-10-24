# CapFootBall

Ứng dụng tìm đối thủ giao hữu bóng đá theo tỉnh/thành và trình độ. Một project **Next.js App Router + TypeScript + Prisma + MySQL 8.4**, với API REST, Google OAuth, chat riêng và trang quản trị.

Thiết kế gốc: [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md). Phạm vi và kết quả kiểm tra thực tế: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

## Chạy trên máy

Yêu cầu Node.js 22.12+, pnpm 10 và Docker đang chạy, hoặc MySQL 8.4/Redis có sẵn.

```powershell
Copy-Item .env.example .env
pnpm install
docker compose -f compose.dev.yml up -d
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Mở http://localhost:3019. Seed chỉ thêm danh mục 34 tỉnh/thành và cấu hình ủng hộ đang tắt; không tạo tài khoản hay kèo giả. Có thể duyệt danh sách công khai trước khi cấu hình Google.

`DATABASE_URL` trong `.env.example` khớp MySQL 8.4 ở `compose.dev.yml`. Lần đầu cài dependencies thành công, commit `pnpm-lock.yaml`; sau đó chuyển CI và Docker sang `pnpm install --frozen-lockfile`.

Database hiện dùng **MySQL 8.4**. Migration trong `prisma/migrations` dành cho database MySQL mới; SQL PostgreSQL cũ được giữ ở `prisma/legacy-postgresql` để tham khảo. Nếu đã có dữ liệu PostgreSQL, cần xuất và chuyển dữ liệu riêng sang MySQL; đổi `DATABASE_URL` không tự chuyển dữ liệu. Không chạy migration MySQL vào database PostgreSQL cũ.

Danh sách loại sân (`Venue.formats`) lưu bằng JSON. Tìm kiếm chữ dùng collation `utf8mb4_unicode_ci`; khóa bản ghi và unique index theo trạng thái giữ cơ chế chỉ chốt một đối thủ cho mỗi kèo.

## Đăng nhập Google

1. Tạo OAuth client loại Web application trong Google Cloud Console.
2. Thêm redirect URI `http://localhost:3019/api/auth/callback/google` và URI tương ứng của từng môi trường production.
3. Điền `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL` trong `.env`.
4. Sinh `AUTH_SECRET` và `CRON_SECRET` độc lập bằng lệnh dưới; lưu kết quả vào `.env`.
5. Điền `ADMIN_EMAILS` trước lần đăng nhập đầu của quản trị viên.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Đăng nhập lần đầu → mở Hồ sơ → đồng ý Điều khoản & Chính sách trước khi đăng kèo, nhận kèo hoặc chat. Chỉ email Google đã xác minh được chấp nhận. Quyền admin được cấp từ `ADMIN_EMAILS` khi tạo tài khoản lần đầu; các lần đổi quyền sau qua trang quản trị.

## Luồng chính

- Chọn tỉnh/thành, lọc sân 5/7/11, khoảng trình độ, ngày và từ khóa. Khu vực lưu trong Zustand/localStorage và cookie; link `?province=79` ưu tiên khi mở trang.
- Đăng kèo với sân trong danh mục hoặc nhập tay; có thể gợi ý thêm sân chờ duyệt.
- Người nhận gửi yêu cầu → tạo hội thoại riêng → chủ kèo chấp nhận một yêu cầu. Các yêu cầu khác tự bị từ chối. MySQL 8.4 khóa bản ghi kèo và có unique index theo điều kiện chống hai đối thủ được chấp nhận.
- Số Zalo chỉ xuất hiện cho đối tác đã chốt khi chủ số đồng ý chia sẻ. Email/điện thoại không nằm trong API công khai.
- Chat có phân trang, chấm chưa đọc, polling dự phòng, chặn/báo cáo và giới hạn tốc độ. Realtime dùng Pusher hoặc Socket.io theo cấu hình.
- Sau giờ đá 3 tiếng, hai bên có thể đánh giá; sửa trong 24 giờ. Báo bùng kèo chờ phản bác trong 72 giờ. Khi tranh chấp, admin xử lý trước khi tính uy tín. Điểm trung bình chỉ công khai sau ít nhất 3 đánh giá.
- Xóa tài khoản sẽ xóa thông tin định danh, token Google, session và push subscription, hủy kèo sắp tới; giữ lịch sử tin nhắn/đánh giá dưới tài khoản ẩn danh.

## API và quản trị

Các endpoint trong thiết kế được điều phối bởi `src/app/api/[...path]/route.ts`, với logic ở `src/services/`. Auth.js có route riêng `/api/auth/*`. Lỗi theo `{ error: { code, message }, requestId }`. API có dữ liệu phiên luôn trả `Cache-Control: no-store`.

Các trang quản trị: `/admin`, `/admin/users`, `/admin/matches`, `/admin/reports`, `/admin/provinces`, `/admin/venues`, `/admin/ratings`, `/admin/donate`, `/admin/audit-logs`. Có kiểm quyền ở proxy, layout server và từng API. Thao tác thay đổi dữ liệu và audit log nằm trong cùng giao dịch.

Nhập sân CSV: cột `name,address,province_code,lat,lng,formats,phone`; `formats` dùng `5|7|11`, mã tỉnh hai chữ số. Tối đa 500 dòng/lần. Sân được chống trùng theo tên chuẩn hóa + mã tỉnh.

## Realtime và thông báo

`REALTIME_DRIVER=none` và `NEXT_PUBLIC_REALTIME_DRIVER=none` dành cho phát triển, chat vẫn cập nhật bằng polling.

Vercel: dùng `pusher`, điền `PUSHER_APP_ID`, `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`. Cả server và client cần chọn cùng driver.

VPS: dùng `socketio`; `server.ts` chạy thành tiến trình bên cạnh Next.js. Redis chuyển sự kiện từ app tới mọi realtime instance. Caddy chuyển `/socket.io/*` tới realtime service. Client nhận token HMAC ngắn hạn sau khi API kiểm tra thành viên hội thoại; socket kiểm tra lại trạng thái tài khoản định kỳ.

Web chạy ở cổng `3019`, Socket.IO ở cổng `3020`. Khi dùng Socket.IO trên máy, đặt `REALTIME_DRIVER=socketio`, `NEXT_PUBLIC_REALTIME_DRIVER=socketio`, `NEXT_PUBLIC_SOCKET_URL=http://localhost:3020`, `SOCKET_PORT=3020` và chạy thêm `pnpm dev:socket` ở terminal thứ hai. Redis phải hoạt động. Trên VPS, Caddy dùng `PORT` và `SOCKET_PORT` trong `.env` để chuyển tiếp; trình duyệt vẫn truy cập tên miền qua HTTPS và để trống `NEXT_PUBLIC_SOCKET_URL`.

Trong production, `REDIS_URL` bắt buộc cho giới hạn tốc độ; nếu thiếu hoặc Redis lỗi, thao tác ghi bị từ chối với 503. Có thể dùng Redis managed có TCP/TLS cho Vercel. Không dùng URL REST của Redis với ioredis.

Thông báo lưu trong DB; Nodemailer SMTP và Web Push được bật khi có cấu hình. Email tin nhắn không được gửi. Thông báo tin nhắn trong web được gộp theo hội thoại trong khoảng 15 phút. Mạng lỗi ở Pusher/push/email không làm mất tin nhắn đã lưu; xem thêm giới hạn giao nhận trong tài liệu trạng thái.

Gửi email qua Nodemailer: điền `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` trong `.env`. Mẫu hiện dùng Gmail: `smtp.gmail.com`, cổng `465`, `SMTP_SECURE=true`; `SMTP_USER` là địa chỉ Gmail, `SMTP_PASS` là App Password, `EMAIL_FROM="CapFootBall <your-email@gmail.com>"`. Nếu nhà cung cấp dùng cổng `587`, đặt `SMTP_SECURE=false` để kết nối qua STARTTLS. Thiếu host, tài khoản, mật khẩu hoặc người gửi thì ứng dụng bỏ qua gửi email. Khởi động lại app sau khi đổi `.env`.

Web Push: tạo cặp VAPID, điền `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:...`. Khóa công khai cần có lúc build. Người dùng bật trong Hồ sơ. iOS cần cài ứng dụng lên Màn hình chính.

PWA chỉ bật ở production: `pnpm build` → `pnpm start`. Service worker lưu tài nguyên tĩnh, danh mục công khai và trang offline; không lưu API cá nhân, chat, trang đăng nhập hay RSC. Icon được sinh bằng `node scripts/generate-icons.mjs`.

## Kiểm tra

```powershell
pnpm exec prisma validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Test tích hợp cần database riêng có tên chứa `test` hoặc `e2e`; migration và seed phải chạy vào DB đó trước.

```powershell
$env:DATABASE_URL = 'mysql://capfootball:capfootball_local@localhost:3306/capfootball_test'
pnpm db:deploy
pnpm db:seed
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

Test tích hợp dùng MySQL 8.4 thật, kiểm tra chốt kèo đồng thời, quyền sửa kèo, hội thoại riêng, chia sẻ/rút quyền Zalo, báo bùng kèo và xóa tài khoản. Test e2e hiện kiểm tra trang công khai, chọn tỉnh trên điện thoại và chặn truy cập khi chưa đăng nhập; chưa tự động hóa Google OAuth.

Khi không truy cập được registry nhưng đã có TypeScript và Zod cục bộ, `node scripts/check-offline.mjs` rồi `node .cache/offline/tests/unit/domain.test.js` kiểm tra cú pháp và chạy test miền nghiệp vụ. Bước này không thay thế typecheck/build với đủ dependencies.

## Triển khai

Chỉ dùng `.github/workflows/deploy.yml`: push `main` hoặc chạy workflow thủ công để SSH vào VPS, `git pull`, build Docker ngay trên VPS, migrate/seed và thay hai container web `3019`, Socket.IO `3020`.

Thêm GitHub Actions secrets `VPS_HOST`, `VPS_USERNAME`, `VPS_KEY`. Mã nguồn và `.env` đặt tại `/devops/capfootball`; đổi bằng Actions variable `VPS_DEPLOY_PATH`. VPS dùng MySQL/Redis đang kết nối trong `.env` và cần có Git/Docker. Các biến public khi build lấy từ Actions Variables; xem [hướng dẫn triển khai](docs/DEPLOYMENT.md).

Schema production chỉ cập nhật bằng `prisma migrate deploy`. Migration cần tương thích ngược. Chạy các kiểm tra trong phần trên trước khi push `main`.

## Nguồn kỹ thuật

- [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation)
- [Auth.js Google](https://authjs.dev/reference/core/providers/google)
- [Province Open API v2](https://provinces.open-api.vn/api/v2/) — snapshot danh mục, ngày 23/10/2026; ứng dụng đọc DB, không gọi dịch vụ này theo mỗi lượt xem.
- [Serwist cho Next.js](https://serwist.pages.dev/docs/next)
