# Triển khai CapFootBall

## Chuẩn bị chung

Tạo MySQL 8.4 và Redis riêng cho từng môi trường. Cấu hình Google OAuth với redirect URI `/api/auth/callback/google`; cung cấp các URL công khai `/privacy`, `/terms`, `/data-deletion` sau khi bổ sung thông tin đơn vị vận hành. Dùng các file `.env.*.example` làm mẫu, giữ secrets ngoài Git.

Các biến `NEXT_PUBLIC_*` được nhúng vào bundle khi build, cần build lại khi đổi. `REALTIME_DRIVER` và `NEXT_PUBLIC_REALTIME_DRIVER` phải tương ứng. Không đưa OAuth secret, `AUTH_SECRET`, Redis password hay DB URL vào build args công khai.

Email dùng Nodemailer qua SMTP. Cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` trong runtime environment của Vercel hoặc `.env` trên VPS. Cổng `465` dùng `SMTP_SECURE=true`; cổng `587` dùng `SMTP_SECURE=false` với STARTTLS. Với Gmail, dùng App Password cho `SMTP_PASS` và địa chỉ Gmail tương ứng cho `SMTP_USER`/`EMAIL_FROM`. Không dùng lại `RESEND_API_KEY`. Nếu chưa điền đủ cấu hình, email sẽ tạm tắt.

Chạy lint, typecheck, unit, integration và build trước lần deploy đầu. Tạo và commit lockfile sau khi cài dependencies thành công. Thiết lập branch protection cho `main` và GitHub Environments `production-vercel`, `production-vps` theo quy trình của dự án.

## Vercel

1. Tạo project từ repository này, dùng Node.js 22 và Next.js.
2. Nhập biến từ `.env.vercel.example` vào Project Settings. Dùng MySQL 8.4 managed và Redis TCP/TLS; chọn Pusher cho realtime.
3. Thêm secrets GitHub: `DATABASE_URL_VERCEL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
4. Workflow lấy đúng commit đã qua CI, build, migrate và seed, sau đó deploy production.
5. Cấu hình `CRON_SECRET` trên Vercel. `vercel.json` gọi `/api/cron/tick` mỗi 15 phút. Tần suất này cần gói Vercel hỗ trợ cron tương ứng; nếu không, dùng scheduler ngoài gọi endpoint với bearer secret.

Mỗi PR/preview phải có DB và secrets riêng. Workflow preview + tạo DB branch chưa được tự động hóa; không trỏ preview vào DB production. Nếu bật tích hợp tự deploy Git của Vercel song song workflow, cần đảm bảo không xuất bản trước migration; có thể dùng riêng workflow được cung cấp.

## VPS

### Cài bằng một lệnh

VPS Ubuntu 22.04+ hoặc Debian 12+ dùng systemd. Trỏ bản ghi DNS của tên miền về VPS, mở TCP 80/443 (UDP 443 cho HTTP/3). Đưa mã nguồn dự án lên VPS, ví dụ `/opt/capfootball`, rồi chạy trong thư mục đó:

```sh
bash ops/install.sh football.tenmiencuaban.vn
```

Script tự yêu cầu quyền root qua sudo, cài Docker Engine/Compose từ repository chính thức, hỏi Google OAuth và SMTP tùy chọn, tạo `.env` với mật khẩu ngẫu nhiên, build app, khởi động MySQL/Redis, migrate/seed, bật app/realtime/Caddy HTTPS và cron mỗi 15 phút. Google OAuth cần redirect URI `https://football.tenmiencuaban.vn/api/auth/callback/google`. SMTP Gmail dùng App Password.

Nếu đã có `.env`, script giữ nguyên và kiểm tra cấu hình VPS trước khi triển khai. Khi cài mới, chỉ đưa mã nguồn lên; file `.env` trên máy phát triển dùng địa chỉ localhost hoặc dịch vụ cloud không tự chuyển thành cấu hình VPS. Mật khẩu không được in ra màn hình. Không chia sẻ `.env`.

Sau khi cập nhật mã nguồn, chạy lại `bash ops/install.sh`; dữ liệu trong Docker volumes và cấu hình `.env` được giữ. Script không tự cập nhật Git hoặc chuyển dữ liệu TiDB/PostgreSQL sang MySQL mới. Nếu VPS đang có web server chiếm cổng 80/443, cần cấu hình proxy hiện có hoặc giải phóng các cổng đó trước khi cài Caddy.

Xem tiến trình bằng `docker compose logs -f app realtime proxy`. Script chỉ báo hoàn tất sau khi các service đã khởi động và API health đạt; chứng chỉ HTTPS cần DNS trỏ đúng và các cổng công khai truy cập được. Bộ cài chưa được chạy trên VPS thật trong phiên này.

### Triển khai thủ công hoặc dùng CI

Trên VPS Linux có Docker Compose, chuẩn bị `/opt/capfootball` với `docker-compose.yml`, `ops/`, `.env`. Mẫu `.env.vps.example` dùng service name `mysql` và `redis`. `MYSQL_ROOT_PASSWORD` cần mật khẩu riêng. `MYSQL_PASSWORD` phải khớp mật khẩu trong `DATABASE_URL` (URL-encode nếu có ký tự đặc biệt).

Trước lần đầu:

```sh
docker compose build
docker compose up -d mysql redis
docker compose run --rm app pnpm db:deploy
docker compose run --rm app pnpm db:seed
docker compose up -d app realtime proxy
```

Tên miền `APP_DOMAIN` trỏ về VPS để Caddy cấp HTTPS. Chỉ proxy công bố cổng HTTP/HTTPS; MySQL 8.4 và Redis ở mạng nội bộ Docker. Với GHCR private, đăng nhập registry trên VPS bằng tài khoản có quyền đọc image trước khi chạy workflow.

Secrets GitHub: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`; runtime secrets đặt trong `.env` của VPS. Workflow build image theo commit, push GHCR rồi gọi `ops/deploy.sh`. Thư mục triển khai trên VPS cần được cập nhật các file Compose/ops khi cấu hình vận hành thay đổi; workflow hiện chỉ đổi image ứng dụng.

Script chạy migration trước khi thay app, kiểm tra `/api/health`, và quay lại image cũ nếu health check thất bại. Migration không rollback tự động; phải thiết kế migration tương thích ngược. Lần deploy đầu không có image cũ để khôi phục.

Cron máy chủ (mỗi 15 phút) gọi qua HTTPS, lưu secret trong file cấu hình được bảo vệ; không commit cron có secret:

```sh
curl --fail --silent --show-error -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/tick
```

Khi khởi động lại Compose thủ công, đặt `APP_IMAGE` về image đã triển khai thành công (giá trị trong `.deployed-image`), hoặc cập nhật `APP_IMAGE` trong `.env` theo quy trình vận hành.

## Backup và thử khôi phục

`ops/backup.sh` tạo file SQL bằng `mysqldump --single-transaction` trong `BACKUP_DIR` với quyền hạn chế. Cần cấu hình thêm mã hóa, upload object storage, lịch chạy và giữ 7 bản ngày + 4 bản tuần theo thiết kế. Script không tự xóa bản sao lưu.

Thử khôi phục vào database tạm, tuyệt đối không dùng DB production làm đích:

```sh
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "CREATE DATABASE capfootball_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"'
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot capfootball_restore_test' < /PROTECTED_PATH/backup.sql
```

Kiểm tra số bản ghi, liên kết, tài khoản và hội thoại trên DB thử; ghi lại kết quả. Database tạm có dữ liệu cá nhân, chỉ để trong môi trường hạn chế. Cấu hình lịch xóa bản sao lưu và thông báo thời gian lưu cho người dùng. Bản khôi phục thực tế chưa được chạy trong phiên triển khai mã nguồn này.

## Theo dõi sau triển khai

- Đặt uptime monitor cho `/api/health`.
- Xem log JSON với request ID; lỗi API không ghi nội dung chat, OAuth token hoặc số liên hệ.
- Cấu hình cảnh báo Redis/DB, backup và lỗi giao email/push.
- Sentry, off-site backup và chính sách lưu dữ liệu cần kết nối tài khoản vận hành; chưa được cấu hình tự động.
- Kiểm tra thực tế Google login, hai tài khoản nhận/chốt kèo, Pusher/Socket.io, mobile PWA và push trước khi mở công khai.
