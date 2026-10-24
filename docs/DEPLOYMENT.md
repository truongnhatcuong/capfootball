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

Actions Variables tùy chọn: `NEXT_PUBLIC_SOCKET_URL` (URL công khai của socket), `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (khóa Web Push công khai). Các giá trị này được nhúng vào image khi build; nếu đổi cần deploy lại. Workflow dùng Socket.IO cho realtime.

## Cấu hình VPS

Giữ `.env` trong thư mục dự án. Dùng `.env.vps.example` làm mẫu, điền `DATABASE_URL`, `REDIS_URL`, `AUTH_URL`, `AUTH_SECRET`, Google OAuth, `CRON_SECRET` và các biến Nodemailer SMTP hiện có. Workflow giữ file gốc, đọc các giá trị đã bỏ dấu nháy vào file tạm có quyền hạn chế rồi truyền vào container; file tạm bị xóa khi kết thúc. Nội dung bí mật không được in ra log hay đưa vào image. Các giá trị phải nằm trên một dòng.

MySQL và Redis dùng dịch vụ đang có. Container dùng mạng host trên Linux, vì vậy `localhost` trong URL trỏ tới VPS. URL phải là địa chỉ MySQL/Redis thực sự truy cập được từ VPS.

Web chạy ở cổng `3019`, Socket.IO ở `3020`. Với HTTPS, reverse proxy hiện có chuyển `/socket.io/` tới `127.0.0.1:3020`, hỗ trợ WebSocket, và các đường dẫn còn lại tới `127.0.0.1:3019`. `AUTH_URL` là URL công khai và Google OAuth dùng callback `${AUTH_URL}/api/auth/callback/google`. Nếu proxy socket cùng domain, để trống Actions variable `NEXT_PUBLIC_SOCKET_URL`; nếu khác domain/cổng, đặt URL công khai tương ứng.

## Luồng deploy

1. Pull `main`; dừng nếu HEAD khác commit kích hoạt workflow.
2. Build image Docker từ `Dockerfile` ngay trên VPS.
3. Chạy `prisma migrate deploy` và seed bằng kết nối MySQL đã cấu hình.
4. Thay hai container `capfootball-app-1` và `capfootball-realtime-1`, tự khởi động lại bằng `--restart unless-stopped`.
5. Kiểm tra API health của web và Socket.IO trước khi báo thành công.

Lỗi build hoặc migration sẽ dừng trước khi thay container đang chạy. Workflow chưa tự động rollback sau khi thay container; migration cần tương thích ngược. Image cũ được giữ để phục hồi thủ công. Scheduler hiện có tiếp tục gọi `/api/cron/tick` với header `Authorization: Bearer CRON_SECRET`. Backup MySQL và HTTPS dùng cấu hình vận hành hiện có của VPS.

Workflow chưa được chạy trên VPS thật trong phiên chỉnh mã nguồn này.
