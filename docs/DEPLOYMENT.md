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

Realtime dùng Pusher. Workflow đọc `PUSHER_APP_ID`, `NEXT_PUBLIC_PUSHER_KEY`, `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_CLUSTER` trong `.env` trên VPS. Chỉ key/cluster công khai được truyền vào build; app ID/secret dùng ở runtime. Actions variable `NEXT_PUBLIC_VAPID_PUBLIC_KEY` tùy chọn ghi đè khóa Web Push trong `.env`.

## Cấu hình VPS

Giữ `.env` trong thư mục dự án. Dùng `.env.vps.example` làm mẫu, điền `DATABASE_URL`, `REDIS_URL`, `AUTH_URL`, `AUTH_SECRET`, Google OAuth, `CRON_SECRET` và các biến Nodemailer SMTP hiện có. Workflow giữ file gốc, đọc các giá trị đã bỏ dấu nháy vào file tạm có quyền hạn chế rồi truyền vào container; file tạm bị xóa khi kết thúc. Nội dung bí mật không được in ra log hay đưa vào image. Các giá trị phải nằm trên một dòng.

MySQL và Redis dùng dịch vụ đang có, ví dụ TiDB Cloud và Upstash đã cấu hình. URL phải truy cập được từ container. Với mạng bridge, `localhost` trong URL trỏ tới container; dùng địa chỉ mạng thực tế khi dịch vụ nằm ngoài container.

Cổng công khai của web lấy từ `PORT` trong `.env` (nếu bỏ trống sẽ dùng `2019`). Ví dụ:

```env
PORT=3019
```

Docker publish `${PORT}:2019`; cổng trong container luôn là `2019`. Ví dụ đổi `PORT=5019` rồi deploy lại, reverse proxy cấu hình upstream `http://127.0.0.1:5019`. Workflow kiểm tra cổng trong khoảng `1..65535` trước khi build/thay container. Pusher không cần cổng realtime riêng trên VPS.

`AUTH_URL` vẫn là URL công khai (ví dụ `https://capfootball.pp.ua`), Google OAuth dùng callback `${AUTH_URL}/api/auth/callback/google`. Nếu truy cập trực tiếp bằng IP/cổng, dùng URL công khai có đúng cổng đó.

## Luồng deploy

1. Pull `main`; dừng nếu HEAD khác commit kích hoạt workflow.
2. Đọc `.env`, kiểm tra cổng/Pusher và build image Docker ngay trên VPS.
3. Dùng nguyên kết nối database hiện có; không tự tạo database, chạy migration hay seed.
4. Thay container web `capfootball-app-1`, publish cổng đã chọn và tự khởi động lại bằng `--restart unless-stopped`. Container realtime cũ được dọn khi nâng cấp.
5. Kiểm tra API health của web trước khi báo thành công.

URL `mysql://build:build@localhost:3306/build` trong Dockerfile chỉ là giá trị cho Prisma generate ở bước build, không tạo hay thay thế database thật. Container chạy bằng `DATABASE_URL` từ `.env` trên VPS.

Lỗi build sẽ dừng trước khi thay container đang chạy. Khi có thay đổi schema, chạy migration tương thích ngược riêng bằng `prisma migrate deploy`. Workflow chưa tự động rollback; image cũ được giữ để phục hồi thủ công. Scheduler hiện có tiếp tục gọi `/api/cron/tick` với header `Authorization: Bearer CRON_SECRET`. Backup MySQL và HTTPS dùng cấu hình vận hành hiện có của VPS.

Workflow chưa được chạy trên VPS thật trong phiên chỉnh mã nguồn này.

## Cache khi build

Docker giữ pnpm `10.33.2` và dùng BuildKit lưu pnpm store cùng `.next/cache` trên VPS, gồm cache biên dịch và TypeScript của Next.js. Khi chỉ đổi source, lớp cài dependencies được tái sử dụng; khi đổi dependency, pnpm có thể dùng lại các gói đã tải. Tài liệu, test và workflow được loại khỏi build context để thay đổi các file đó không buộc build lại app. Prisma Client chỉ được sinh ở bước build, tránh lặp ở postinstall. Hiện repo chưa có `pnpm-lock.yaml`; dependency vẫn được phân giải khi lớp install cần chạy lại.

Hai stage dùng chung base image đã có OpenSSL/certificates. Runtime giữ bố cục ứng dụng đã kiểm tra, gồm Prisma Client/engine. Giữ cache của Docker builder giữa các lần deploy; `docker builder prune`/`docker system prune` có thể làm mất cache. Lần đầu sau khi đổi Dockerfile vẫn cần làm nóng cache; thời gian thực tế cần đo trên VPS.
