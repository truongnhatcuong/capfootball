# Triển khai CapFootBall

Dùng duy nhất `.github/workflows/deploy.yml`. Workflow chạy khi push `main` hoặc chọn **Actions → Deploy → Run workflow** trên nhánh `main`.

## Cấu hình GitHub

Thêm ba Actions secrets:

| Secret | Giá trị |
| --- | --- |
| `VPS_HOST` | IP hoặc hostname của VPS |
| `VPS_USER` | Tài khoản SSH |
| `VPS_SSH_KEY` | Toàn bộ private key SSH |

Mặc định thư mục dự án là `/home/ubuntu/devops/capfootball` (tương ứng `~/devops/capfootball` khi đăng nhập bằng tài khoản `ubuntu`). Nếu khác, đặt Actions variable `VPS_DEPLOY_PATH` bằng đường dẫn tuyệt đối. VPS cần có Git, Docker Engine, quyền chạy Docker và quyền `git pull` repository. Working tree phải sạch và đang ở nhánh `main`.

Workflow lấy cấu hình realtime và các giá trị public để build từ `.env` trên VPS, gồm Pusher key/cluster, Socket.IO URL và VAPID key. `REALTIME_DRIVER` và `NEXT_PUBLIC_REALTIME_DRIVER` phải khớp nhau. Actions Variables tùy chọn `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` sẽ ghi đè giá trị tương ứng trong `.env` nếu được điền. Các giá trị public được nhúng vào image khi build; nếu đổi cần deploy lại.

## Cấu hình VPS

Giữ `.env` trong thư mục dự án. Dùng `.env.vps.example` làm mẫu, điền `DATABASE_URL`, `REDIS_URL`, `AUTH_URL`, `AUTH_SECRET`, Google OAuth, `CRON_SECRET` và các biến Nodemailer SMTP hiện có. Workflow giữ file gốc, đọc các giá trị đã bỏ dấu nháy vào file tạm có quyền hạn chế rồi truyền vào container; file tạm bị xóa khi kết thúc. Nội dung bí mật không được in ra log hay đưa vào image. Các giá trị phải nằm trên một dòng.

MySQL và Redis dùng dịch vụ đang có. Container dùng mạng host trên Linux, vì vậy `localhost` trong URL trỏ tới VPS. URL phải là địa chỉ MySQL/Redis thực sự truy cập được từ VPS.

Web chạy ở cổng `3019`. Khi `.env` dùng `socketio`, workflow chạy thêm Socket.IO ở `3020`; khi dùng `pusher` hoặc `none`, không chạy container socket riêng. Với Socket.IO và HTTPS, reverse proxy hiện có chuyển `/socket.io/` tới `127.0.0.1:3020`, hỗ trợ WebSocket, và các đường dẫn còn lại tới `127.0.0.1:3019`. `AUTH_URL` là URL công khai và Google OAuth dùng callback `${AUTH_URL}/api/auth/callback/google`. Nếu proxy socket cùng domain, để trống `NEXT_PUBLIC_SOCKET_URL`; nếu khác domain/cổng, đặt URL công khai tương ứng.

## Luồng deploy

1. Pull `main`; dừng nếu HEAD khác commit kích hoạt workflow.
2. Đọc `.env`, kiểm tra cấu hình realtime và build image Docker ngay trên VPS.
3. Dùng nguyên kết nối database hiện có; không tự tạo database, chạy migration hay seed.
4. Thay container `capfootball-app-1`; chạy thêm `capfootball-realtime-1` nếu dùng Socket.IO. Container tự khởi động lại bằng `--restart unless-stopped`.
5. Kiểm tra API health của web và Socket.IO (nếu chạy) trước khi báo thành công.

URL `mysql://build:build@localhost:3306/build` trong Dockerfile chỉ là giá trị cho Prisma generate ở bước build, không tạo hay thay thế database thật. Container chạy bằng `DATABASE_URL` từ `.env` trên VPS.

Lỗi build sẽ dừng trước khi thay container đang chạy. Khi có thay đổi schema, chạy migration tương thích ngược riêng bằng `prisma migrate deploy`. Workflow chưa tự động rollback; image cũ được giữ để phục hồi thủ công. Scheduler hiện có tiếp tục gọi `/api/cron/tick` với header `Authorization: Bearer CRON_SECRET`. Backup MySQL và HTTPS dùng cấu hình vận hành hiện có của VPS.

Workflow chưa được chạy trên VPS thật trong phiên chỉnh mã nguồn này.
