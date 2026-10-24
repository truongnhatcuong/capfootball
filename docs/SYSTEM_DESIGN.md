# CapFootBall – Thiết kế hệ thống

Nền tảng **cáp kèo bóng đá**: người chơi / đội bóng trong cùng khu vực tìm đối thủ cùng trình độ, nhắn tin trực tiếp và chốt kèo (có thể chuyển sang Zalo).

Stack: **Next.js (App Router) + Prisma + MySQL 8.4 + Route Handlers (REST API)**.

---

## 1. Mục tiêu & phạm vi

| Mục tiêu | Mô tả |
|---|---|
| Đăng kèo | Đội/người chơi đăng bài tìm đối thủ: thời gian, sân, trình độ, khu vực, phí sân |
| Lọc theo trình độ | 6 mức: Yếu, TB yếu, Trung bình, TB khá, Khá, Giỏi |
| Lọc theo khu vực | Tỉnh/thành (và phường/xã nếu cần) – nhớ lựa chọn trên máy người dùng |
| Nhắn tin | Chat 1-1 giữa người đăng kèo và người nhận kèo; kèm nút mở Zalo |
| Chốt kèo | Nhận kèo → người đăng xác nhận → trạng thái `MATCHED` |

Ngoài phạm vi MVP: thanh toán, đặt sân, bảng xếp hạng, app mobile native.

---

## 2. Trình độ (Skill Level)

```
1 WEAK          Yếu
2 BELOW_AVG     Trung bình yếu
3 AVERAGE       Trung bình
4 ABOVE_AVG     Trung bình khá
5 GOOD          Khá
6 EXCELLENT     Giỏi / Bán chuyên
```

- Lưu bằng **enum** trong Prisma, kèm map nhãn tiếng Việt ở `src/constants/skill.ts`.
- Lọc kèo theo **khoảng** (ví dụ chỉ hiện kèo từ `AVERAGE` đến `GOOD`) – dùng thứ tự số để so sánh.
- Gợi ý: cho phép người xem chọn "±1 bậc" so với trình độ đội mình.

---

## 3. Kiến trúc tổng quan

```
┌────────────────────────────── Browser ──────────────────────────────┐
│ Next.js (React, App Router)                                         │
│  - Zustand + persist  → localStorage (tỉnh/thành đã chọn)           │
│  - TanStack Query     → gọi API, cache, polling/optimistic          │
│  - Socket client      → chat realtime                               │
└───────────────┬───────────────────────────────┬─────────────────────┘
                │ HTTPS (REST /api/*)           │ WebSocket
┌───────────────▼──────────────┐      ┌─────────▼──────────────┐
│ Next.js Route Handlers       │      │ Realtime service       │
│  - Auth (Auth.js)            │      │ (Pusher/Ably/Socket.io)│
│  - Matches / Chat / Users    │      └─────────┬──────────────┘
│  - Zod validate, rate-limit  │                │
└───────────────┬──────────────┘                │
                │ Prisma Client                 │
        ┌───────▼────────┐                      │
        │ MySQL 8.4     │◄─────────────────────┘
        └────────────────┘
```

Deploy gợi ý: **Vercel** (Next.js) + **managed MySQL 8.4** + **Pusher/Ably** (realtime, vì Vercel serverless không giữ WebSocket lâu).
Nếu tự host VPS: Docker + Socket.io server riêng.

---

> **Một project duy nhất:** frontend, API (Route Handlers), admin và logic nghiệp vụ nằm chung một repo Next.js. `server.ts` (Socket.io) chỉ dùng cho VPS, cũng nằm trong cùng repo; trên Vercel file này không được dùng.

### 3.1 Hỗ trợ deploy kép (Vercel & VPS)

Phần khác biệt duy nhất giữa hai môi trường là **realtime**; còn lại dùng chung một codebase.

```ts
// src/lib/realtime/index.ts
export interface RealtimeProvider {
  publish(channel: string, event: string, payload: unknown): Promise<void>;
  authorize(userId: string, channel: string): Promise<unknown>; // xác thực kênh private
}
// REALTIME_DRIVER=pusher | ably | socketio  → chọn implementation bằng env
```

| | Vercel | VPS (Docker) |
|---|---|---|
| App | Serverless Next.js | `next build` với `output: "standalone"`, chạy bằng Docker |
| DB | Managed MySQL 8.4 | MySQL container (hoặc managed) |
| Realtime | `REALTIME_DRIVER=pusher` (hoặc `ably`) | `REALTIME_DRIVER=socketio` – Socket.io server chạy cùng/ cạnh app, Redis adapter nếu nhiều instance |
| Cron hết hạn kèo | Vercel Cron → `GET /api/cron/expire` (kèm `CRON_SECRET`) | crontab/host cron gọi cùng endpoint đó |
| Rate limit | Upstash Redis | Redis container (cùng interface `@upstash/ratelimit` hoặc `rate-limiter-flexible`) |
| Reverse proxy | – | Nginx/Caddy + HTTPS, bật upgrade WebSocket |

Client chat cũng đi qua một hook `useRealtime(channel)` che giấu driver, nên component UI không đổi giữa hai môi trường. Cung cấp `docker-compose.yml` (app + mysql + redis) và `.env.example` cho từng môi trường.

### 3.2 CI/CD (GitHub Actions)

Repo duy nhất → 3 workflow:

| Workflow | Kích hoạt | Việc làm |
|---|---|---|
| `ci.yml` | Pull request & push mọi nhánh | cài deps (cache pnpm) → `prisma validate` + `prisma generate` → `eslint` → `tsc --noEmit` → `vitest` → `next build`. Chạy kèm **service container MySQL** để test với DB thật và thử `prisma migrate deploy` trên DB trống. Playwright e2e chạy riêng, có thể chỉ trên `main`. |
| `deploy-vercel.yml` | Push `main` (sau khi `ci` xanh) | `prisma migrate deploy` vào DB production của Vercel → `vercel pull/build/deploy --prod`. PR có **preview deployment** với DB riêng (database MySQL thử nghiệm riêng). |
| `deploy-vps.yml` | Push `main` hoặc tag `v*` | build Docker image → push **GHCR** → SSH vào VPS: `docker compose pull && docker compose run --rm app npx prisma migrate deploy && docker compose up -d` → health check `GET /api/health`; lỗi thì rollback về image tag trước. |

Nguyên tắc:
- **Migration chạy trước khi đổi code**, chỉ dùng `prisma migrate deploy` trên production (không dùng `migrate dev`/`db push`). Migration phải **tương thích ngược** (thêm cột nullable → deploy code → mới xóa cột cũ) để rollback an toàn.
- **Mỗi môi trường một DB** (Vercel prod, VPS prod, preview). Nếu hai nơi dùng **chung một DB** thì chỉ để **một** workflow chạy migrate, tránh chạy trùng.
- **Branch protection:** `main` yêu cầu `ci` xanh + 1 review; deploy production dùng GitHub **Environments** (`production-vercel`, `production-vps`) có thể bật phê duyệt thủ công.
- **Secrets:** `DATABASE_URL_VERCEL`, `DATABASE_URL_VPS`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (+ `GITHUB_TOKEN` cho GHCR). Biến runtime của app (`AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `PUSHER_*`, `VAPID_*`, `ADMIN_EMAILS`, `CRON_SECRET`) đặt ở Vercel Project Settings và ở `.env` trên VPS, không đưa vào image.
- Dependabot cập nhật dependency; thêm bước `pnpm audit` trong CI.

---

## 4. Thư viện đề xuất (tùy chọn)

| Nhu cầu | Khuyến nghị | Thay thế |
|---|---|---|
| ORM | **Prisma** | – |
| DB | **MySQL 8.4** | – |
| Auth | **Auth.js (NextAuth v5)** – chỉ Google OAuth | Clerk, Lucia |
| Validate | **Zod** | Valibot |
| Data fetching | **TanStack Query** | SWR |
| State + localStorage | **Zustand** (`persist` middleware) | `usehooks-ts` `useLocalStorage` |
| Form | **React Hook Form** + zodResolver | – |
| UI | **Tailwind CSS + shadcn/ui** | MUI, Mantine |
| Chọn tỉnh/thành | Xem mục 5 | – |
| Realtime chat | Qua **adapter**: **Pusher/Ably** (Vercel) và **Socket.io** (VPS) – xem mục 3.1 | Supabase Realtime |
| Ngày giờ | **date-fns** (locale `vi`) | dayjs |
| Rate limit | **@upstash/ratelimit** | tự viết với Redis |
| Bản đồ sân | **react-leaflet** + OpenStreetMap (miễn phí, không cần API key) | Google Maps / Mapbox |
| PWA / service worker | **Serwist** (`@serwist/next`) | Workbox thủ công |
| Web Push | **web-push** (VAPID) | OneSignal |
| CI/CD | **GitHub Actions** + GHCR + `appleboy/ssh-action` | GitLab CI |
| Upload ảnh (avatar, logo đội) | **UploadThing** / Cloudinary | S3 |

---

## 5. Chọn khu vực & lưu local

### 5.1 Nguồn dữ liệu tỉnh/thành

Chọn **một** trong hai:

1. **API công khai** `provinces.open-api.vn` – gọi từ server, cache lại (không gọi từ browser mỗi lần).
2. **Package/JSON tĩnh** (ví dụ `vietnam-provinces` hoặc tự đóng gói file JSON) – ổn định, không phụ thuộc mạng. **Khuyến nghị**.

> Lưu ý: Việt Nam đã sắp xếp lại đơn vị hành chính từ 7/2025 (bỏ cấp huyện, giảm số tỉnh). Khi chọn thư viện/API phải kiểm tra bộ dữ liệu là **bản mới** hay cũ.

Cách làm khuyến nghị: seed dữ liệu vào bảng `Province` (Prisma seed) → API `/api/provinces` đọc từ DB và cache (`revalidate` 1 ngày). Match tham chiếu `provinceCode`, nên không phụ thuộc dịch vụ bên ngoài.

### 5.2 Lưu lựa chọn ở local

```ts
// src/stores/region.store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type RegionState = {
  provinceCode: string | null;
  provinceName: string | null;
  setProvince: (code: string, name: string) => void;
  clear: () => void;
};

export const useRegionStore = create<RegionState>()(
  persist(
    (set) => ({
      provinceCode: null,
      provinceName: null,
      setProvince: (provinceCode, provinceName) => set({ provinceCode, provinceName }),
      clear: () => set({ provinceCode: null, provinceName: null }),
    }),
    { name: "capfootball-region", version: 1 }
  )
);
```

### 5.3 Luồng

```
Vào web
  ├─ localStorage có provinceCode? ── Có ──► dùng luôn, lọc kèo theo tỉnh đó
  └─ Chưa có ──► mở modal "Chọn tỉnh/thành" (có ô tìm kiếm)
                    └─ chọn xong → setProvince() → lưu localStorage
Đổi tỉnh: bấm tên tỉnh trên header → mở lại modal → setProvince() ghi đè
Đã đăng nhập: đồng bộ thêm vào User.provinceCode (PATCH /api/me) để dùng đa thiết bị
```

Lưu ý SSR/hydration: localStorage chỉ có ở client → đọc trong `useEffect`/dùng `persist` với `skipHydration` hoặc hiển thị skeleton đến khi store hydrate xong, tránh lệch HTML.

Có thể đồng bộ thêm **cookie** `province` để server component lọc sẵn kèo theo tỉnh (tốt cho SEO/tốc độ). Query string `?province=79` ưu tiên cao hơn cookie/localStorage để chia sẻ link.

---

## 6. Mô hình dữ liệu (Prisma)

```prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider = "mysqlql"
  url      = env("DATABASE_URL")
}

enum SkillLevel { WEAK BELOW_AVG AVERAGE ABOVE_AVG GOOD EXCELLENT }
enum MatchStatus { OPEN PENDING MATCHED CANCELLED EXPIRED }
enum RequestStatus { PENDING ACCEPTED REJECTED CANCELLED }
enum Format { FIVE SEVEN ELEVEN }          // sân 5 / 7 / 11
enum VenueStatus { PENDING APPROVED REJECTED }
enum Role { USER ADMIN }
enum NotificationType { REQUEST_RECEIVED REQUEST_ACCEPTED REQUEST_REJECTED NEW_MESSAGE MATCH_REMINDER RATE_PROMPT SYSTEM }
enum UserStatus { ACTIVE BANNED }
enum ReportStatus { OPEN RESOLVED DISMISSED }
enum ReportTarget { MATCH USER MESSAGE }

model Province {
  code   String @id                         // mã tỉnh theo nguồn dữ liệu
  name   String
  slug   String @unique
  users  User[]
  matches Match[]
  venues  Venue[]
}

model User {
  id           String   @id @default(cuid())
  name         String
  email        String?  @unique
  phone        String?  @unique
  avatarUrl    String?
  zaloPhone    String?                      // SĐT Zalo, người dùng tự nhập & đồng ý công khai
  role         Role       @default(USER)
  status       UserStatus @default(ACTIVE)    // BANNED → không đăng nhập/đăng kèo/chat được
  zaloConsentAt DateTime?                     // thời điểm đồng ý công khai SĐT Zalo với đối tác đã chốt kèo
  termsAcceptedAt DateTime?                   // thời điểm đồng ý Điều khoản & Chính sách quyền riêng tư
  ratingAvg    Float?                         // điểm uy tín trung bình (cache, tính lại khi có đánh giá mới)
  ratingCount  Int        @default(0)
  noShowCount  Int        @default(0)         // số lần bị xác nhận bùng kèo
  deletedAt    DateTime?                      // xóa tài khoản = ẩn danh hóa, giữ bản ghi để toàn vẹn dữ liệu
  provinceCode String?
  province     Province? @relation(fields: [provinceCode], references: [code])
  createdAt    DateTime @default(now())

  matches      Match[]        @relation("MatchOwner")
  requests     MatchRequest[]
  conversations ConversationMember[]
  messages     Message[]
}

model Match {                                // "Kèo"
  id           String      @id @default(cuid())
  ownerId      String
  owner        User        @relation("MatchOwner", fields: [ownerId], references: [id])
  teamName     String?                      // tên đội (tùy chọn, chỉ để hiển thị)
  title        String
  description  String?
  skill        SkillLevel
  skillMax     SkillLevel?                  // chấp nhận đối thủ tới mức này
  format       Format
  kickoffAt    DateTime
  venueId      String?                      // chọn từ danh mục sân
  venueRef     Venue?      @relation(fields: [venueId], references: [id])
  venue        String?                      // tên sân nhập tay (khi chọn "Sân khác")
  address      String?
  provinceCode String
  province     Province    @relation(fields: [provinceCode], references: [code])
  fee          Int?                         // phí sân (VND), null = thỏa thuận
  status       MatchStatus @default(OPEN)
  hidden       Boolean     @default(false)   // admin ẩn kèo vi phạm
  createdAt    DateTime    @default(now())
  requests     MatchRequest[]

  @@index([provinceCode, status, kickoffAt])
  @@index([skill])
}

model MatchRequest {                         // người nhận kèo
  id        String        @id @default(cuid())
  matchId   String
  userId    String
  note      String?
  status    RequestStatus @default(PENDING)
  createdAt DateTime      @default(now())
  match     Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
  user      User  @relation(fields: [userId], references: [id])
  @@unique([matchId, userId])
}

model Report {                               // báo cáo vi phạm
  id         String       @id @default(cuid())
  reporterId String
  targetType ReportTarget
  targetId   String
  reason     String
  status     ReportStatus @default(OPEN)
  handledBy  String?
  createdAt  DateTime     @default(now())
  @@index([status, createdAt])
}

model AuditLog {                             // lịch sử thao tác của admin
  id        String   @id @default(cuid())
  adminId   String
  action    String                            // vd "BAN_USER", "HIDE_MATCH"
  targetId  String?
  meta      Json?
  createdAt DateTime @default(now())
}

model Venue {                                // danh mục sân bóng
  id           String      @id @default(cuid())
  name         String
  address      String
  provinceCode String
  province     Province    @relation(fields: [provinceCode], references: [code])
  lat          Float?
  lng          Float?
  formats      Json                           // sân có loại 5 / 7 / 11
  phone        String?
  pricePerHour Int?                           // tham khảo (VND)
  status       VenueStatus @default(APPROVED) // user gợi ý sân mới → PENDING chờ admin duyệt
  createdById  String?
  createdAt    DateTime    @default(now())
  matches      Match[]
  @@index([provinceCode, status])
}

model PushSubscription {                     // Web Push (PWA)
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())
  @@index([userId])
}

model Notification {                        // thông báo trong web (chuông)
  id        String           @id @default(cuid())
  userId    String
  type      NotificationType
  title     String
  body      String?
  url       String?                           // trang mở khi bấm vào
  readAt    DateTime?
  createdAt DateTime         @default(now())
  @@index([userId, readAt, createdAt])
}

model Rating {                               // đánh giá sau trận
  id          String   @id @default(cuid())
  matchId     String
  raterId     String
  ratedUserId String
  happened    Boolean                          // trận có diễn ra không
  noShow      Boolean  @default(false)         // đối tác bùng kèo
  stars       Int?                             // 1–5, bắt buộc khi happened = true
  comment     String?
  createdAt   DateTime @default(now())
  @@unique([matchId, raterId])                 // mỗi người đánh giá 1 lần / kèo
  @@index([ratedUserId])
}

model DonateConfig {                         // cấu hình nút ủng hộ (1 dòng, id = 1)
  id          Int     @id @default(1)
  enabled     Boolean @default(true)
  message     String  @default("Ủng hộ để web duy trì miễn phí ❤️")
  bankBin     String?                          // mã ngân hàng theo VietQR, vd "970422"
  accountNo   String?
  accountName String?
  momoPhone   String?
  momoQrUrl   String?                          // ảnh QR tải lên (tùy chọn)
  paypalUrl   String?
  updatedAt   DateTime @updatedAt
}

model Conversation {
  id        String   @id @default(cuid())
  matchId   String?                           // chat gắn với kèo
  createdAt DateTime @default(now())
  members   ConversationMember[]
  messages  Message[]
}

model ConversationMember {
  conversationId String
  userId         String
  lastReadAt     DateTime?
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([conversationId, userId])
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  senderId       String
  body           String
  createdAt      DateTime @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User @relation(fields: [senderId], references: [id])
  @@index([conversationId, createdAt])
}
```

---

## 7. API (Next.js Route Handlers – REST)

Tất cả trả JSON, validate bằng Zod, lỗi theo dạng `{ error: { code, message } }`.

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| GET | `/api/provinces` | Danh sách tỉnh/thành (cache) | – |
| GET | `/api/matches` | Danh sách kèo. Query: `province`, `skillMin`, `skillMax`, `format`, `date`, `cursor`, `limit` | – |
| GET | `/api/matches/:id` | Chi tiết kèo | – |
| POST | `/api/matches` | Đăng kèo | ✔ |
| PATCH | `/api/matches/:id` | Sửa / hủy kèo (chủ kèo) | ✔ |
| POST | `/api/matches/:id/requests` | Nhận kèo (gửi yêu cầu) | ✔ |
| PATCH | `/api/requests/:id` | Chấp nhận / từ chối (chủ kèo) | ✔ |
| GET | `/api/me` · PATCH `/api/me` | Hồ sơ, tỉnh, SĐT Zalo | ✔ |
| GET | `/api/conversations` | Danh sách hội thoại | ✔ |
| POST | `/api/conversations` | Tạo/lấy hội thoại với 1 user (theo `matchId`) | ✔ |
| GET | `/api/conversations/:id/messages?cursor=` | Lịch sử tin nhắn (phân trang) | ✔ |
| POST | `/api/conversations/:id/messages` | Gửi tin nhắn → lưu DB → publish realtime | ✔ |
| POST | `/api/realtime/auth` | Xác thực kênh private (Pusher/Ably) | ✔ |
| GET | `/api/venues?province=&q=&format=` | Tìm sân trong danh mục theo tỉnh (autocomplete) | – |
| POST | `/api/venues` | Gợi ý sân mới (status `PENDING`) | ✔ |
| POST | `/api/push/subscribe` · DELETE | Đăng ký / hủy Web Push | ✔ |
| GET | `/api/health` | Health check (kiểm tra DB) cho CI/CD & uptime | – |
| GET | `/api/notifications?cursor=` · POST `/api/notifications/read` | Danh sách thông báo; đánh dấu đã đọc | ✔ |
| GET | `/api/notifications/unread-count` | Số chưa đọc cho chuông (polling 30s hoặc realtime) | ✔ |
| GET | `/api/ratings/pending` | Các kèo đã đá đang chờ tôi đánh giá | ✔ |
| POST | `/api/matches/:id/rating` | Gửi đánh giá (đã đá / bùng kèo / số sao / nhận xét) | ✔ |
| DELETE | `/api/me` | Xóa tài khoản (ẩn danh hóa) | ✔ |
| GET | `/api/cron/tick` | Cron gộp: hết hạn kèo, nhắc trước giờ đá, gửi yêu cầu đánh giá | CRON_SECRET |
| GET | `/api/donate` | Cấu hình nút ủng hộ (công khai, cache) | – |
| POST | `/api/reports` | Báo cáo kèo / người dùng / tin nhắn | ✔ |
| GET | `/api/admin/stats` | Số liệu tổng quan, kèo theo tỉnh/ngày | ADMIN |
| GET | `/api/admin/users` · PATCH `/api/admin/users/:id` | Tìm user; khóa/mở khóa, đổi role | ADMIN |
| GET | `/api/admin/matches` · PATCH `/api/admin/matches/:id` | Xem tất cả kèo; ẩn/hiện, hủy | ADMIN |
| GET | `/api/admin/reports` · PATCH `/api/admin/reports/:id` | Xử lý báo cáo | ADMIN |
| GET · POST · PATCH · DELETE | `/api/admin/venues` | Quản lý sân, duyệt sân do user gợi ý, import CSV | ADMIN |
| GET | `/api/admin/provinces` · PATCH | Bật/tắt tỉnh, sửa tên | ADMIN |
| GET · PUT | `/api/admin/donate` | Xem / sửa cấu hình ủng hộ | ADMIN |
| GET · PATCH | `/api/admin/ratings` | Xem đánh giá bị báo cáo, gỡ đánh giá sai/trả đũa | ADMIN |
| GET | `/api/admin/audit-logs` | Lịch sử thao tác admin | ADMIN |

Quy ước:
- Phân trang **cursor-based** (`createdAt,id`) cho kèo và tin nhắn.
- `GET /api/matches` mặc định ẩn kèo quá hạn (`kickoffAt < now`) và `status != OPEN`.
- Cron (Vercel Cron) chạy hằng giờ: chuyển `OPEN → EXPIRED` khi qua giờ đá.

---

## 8. Nhắn tin & Zalo

### 8.1 Chat trong web
1. Người xem bấm **"Nhận kèo"** → tạo `MatchRequest` + tạo/lấy `Conversation` giữa hai bên.
2. Gửi tin: client `POST /messages` → server lưu DB → publish sự kiện lên kênh `private-conv-{id}` → bên kia nhận realtime.
3. Mở lại trang: tải lịch sử từ DB; có `lastReadAt` để hiển thị chấm chưa đọc.
4. Chống spam: rate limit (vd 20 tin/phút/user), giới hạn độ dài 1000 ký tự, chặn/báo cáo người dùng.

### 8.2 Zalo
Zalo không có API công khai miễn phí để nhúng chat, nên làm theo hướng **chuyển sang Zalo**:

- Người dùng tự nhập `zaloPhone` ở hồ sơ và bật "Cho phép liên hệ qua Zalo".
- Chỉ **hiện nút Zalo sau khi chủ kèo chấp nhận** yêu cầu (tránh lộ SĐT cho người lạ).
- Nút mở: `https://zalo.me/{zaloPhone}` (deep link, mở app Zalo trên mobile).
- Tương lai (tùy chọn): Zalo OA / Zalo Notification Service để gửi thông báo kèo mới – cần đăng ký OA doanh nghiệp.

### 8.3 Thông báo

Mọi sự kiện đi qua một hàm duy nhất `notify(userId, type, payload)` trong `src/services/notify.ts`, hàm này ghi `Notification` rồi đẩy ra các kênh.

| Sự kiện | Người nhận | Kênh |
|---|---|---|
| Có người nhận kèo (`REQUEST_RECEIVED`) | Chủ kèo | Chuông + email + push |
| Yêu cầu được chấp nhận / từ chối | Người nhận kèo | Chuông + email + push |
| Tin nhắn mới (`NEW_MESSAGE`) | Người còn lại | Chuông + push; email chỉ khi offline > 15 phút, gộp 1 email / hội thoại |
| Nhắc trước giờ đá 2 tiếng (`MATCH_REMINDER`) | Hai bên của kèo `MATCHED` | Chuông + push |
| Yêu cầu đánh giá (`RATE_PROMPT`) | Hai bên, sau giờ đá + 3 tiếng | Chuông + email |

- **Chuông** trên header: số chưa đọc lấy từ `/api/notifications/unread-count` (polling 30s, hoặc đẩy qua kênh realtime `private-user-{id}` đã có sẵn).
- **Email:** **Nodemailer + SMTP**; template bằng React Email. Người dùng tắt/bật từng loại trong `/profile`.
- **Push:** dùng `PushSubscription` ở mục 9.3.
- **Giới hạn:** gộp thông báo trùng (cùng hội thoại), tối đa 1 email tin nhắn / 15 phút / hội thoại để tránh spam.
- **Cron `tick`** (Vercel Cron hoặc crontab VPS, mỗi 15 phút) tìm kèo cần nhắc / cần đánh giá rồi gọi `notify`. Đánh dấu đã gửi bằng cách kiểm tra đã tồn tại `Notification` cùng `type` + `url` để chạy lại không bị gửi trùng.

---

## 9. Giao diện (Pages)

```
/                       Trang chủ: bộ lọc (tỉnh, trình độ) + danh sách kèo
/matches/[id]           Chi tiết kèo + nút Nhận kèo / Nhắn tin
/matches/new            Đăng kèo
/messages               Danh sách hội thoại
/messages/[id]          Khung chat
/profile                Hồ sơ: tên, avatar, tỉnh, SĐT Zalo
/login                  Đăng nhập Google
/notifications          Trung tâm thông báo
/users/[id]             Hồ sơ công khai: điểm uy tín, số trận, số lần bùng kèo
/terms                  Điều khoản sử dụng
/privacy                Chính sách quyền riêng tư
/data-deletion          Hướng dẫn xóa dữ liệu / tài khoản

/admin                  Dashboard: tổng user, kèo đang mở, kèo theo tỉnh, báo cáo chờ xử lý
/admin/users            Danh sách user: tìm kiếm, khóa/mở khóa, cấp quyền admin
/admin/matches          Tất cả kèo: lọc theo tỉnh/trạng thái, ẩn/hủy kèo vi phạm
/admin/reports          Hàng đợi báo cáo: xem nội dung, xử lý / bỏ qua
/admin/provinces        Quản lý danh mục tỉnh/thành
/admin/venues           Danh mục sân: thêm/sửa, duyệt gợi ý, import CSV
/admin/donate           Cấu hình nút ủng hộ (bật/tắt, tài khoản, QR)
/admin/ratings          Đánh giá bị báo cáo
/admin/audit-logs       Nhật ký thao tác
```

### 9.1 Trang quản lý (Admin)

- Nằm **trong cùng project** dưới route group `src/app/(admin)/admin/...`, dùng layout riêng (sidebar + bảng dữ liệu).
- Bảng dữ liệu: **TanStack Table** + shadcn/ui; biểu đồ: **Recharts**.
- **Phân quyền 3 lớp**: (1) `middleware.ts` chặn `/admin/*` nếu session không phải `ADMIN`; (2) layout admin kiểm tra lại ở server; (3) mỗi route `/api/admin/*` gọi `requireAdmin()` – không tin vào việc ẩn UI.
- Tạo admin đầu tiên: biến môi trường `ADMIN_EMAILS=a@gmail.com,b@gmail.com` – khi đăng nhập Google lần đầu, email nằm trong danh sách được gán `role = ADMIN`. Sau đó admin cấp quyền cho người khác trong `/admin/users`.
- Mọi thao tác khóa user / ẩn kèo / xử lý báo cáo ghi vào `AuditLog`.
- User `BANNED` bị chặn ở callback `signIn` của Auth.js và ở `requireUser()`.

Thành phần chính: `DonateButton`, `ProvincePicker` (modal + tìm kiếm), `SkillFilter` (chip / range slider 6 mức), `MatchCard`, `ChatWindow`, `ZaloButton`.

Màu gợi ý cho 6 mức trình độ: xám → xanh lá nhạt → xanh lá → vàng → cam → đỏ (tăng dần độ "mạnh").

---

### 9.2 Nút ủng hộ (Donate)

Nút nhỏ, không chiếm chỗ, không làm phiền khi dùng web.

- **Vị trí:** nút tròn/pill nhỏ "☕ Ủng hộ" ở góc dưới phải (mobile: nằm trong footer hoặc menu), có thể thu gọn. Component `DonateButton` gắn vào root layout.
- **Khi bấm:** mở modal (shadcn `Dialog`) gồm: lời nhắn, **mã QR VietQR**, thông tin chuyển khoản (ngân hàng, số tài khoản, tên, nút "Sao chép"), và link MoMo/PayPal nếu có.
- **Không xử lý thanh toán trên web:** chỉ hiển thị QR/thông tin để người dùng tự chuyển khoản bằng app ngân hàng → không cần cổng thanh toán, không lưu dữ liệu thẻ, không phát sinh trách nhiệm PCI.
- **Tạo QR:** dựng URL ảnh VietQR từ cấu hình, ví dụ `https://img.vietqr.io/image/{bankBin}-{accountNo}-compact2.png?accountName={name}&addInfo=Ung%20ho%20CapFootBall` (nên kiểm tra lại định dạng URL của dịch vụ khi triển khai). Hoặc sinh QR ngay trong web bằng thư viện `qrcode.react` để khỏi phụ thuộc bên ngoài, hoặc dùng ảnh QR admin tự tải lên (`momoQrUrl`).
- **Cấu hình ở admin:** `/admin/donate` sửa `DonateConfig` (bật/tắt nút, lời nhắn, tài khoản, QR). Thay đổi ghi vào `AuditLog`. `GET /api/donate` cache ngắn (`revalidate` 5 phút); nếu `enabled = false` hoặc chưa có thông tin thì **ẩn hẳn nút**.
- **Gợi ý hiển thị:** có thể hiện nút nổi bật hơn sau khi người dùng chốt kèo thành công (trạng thái `MATCHED`), vì lúc đó họ hài lòng nhất; không dùng popup tự bật.
- **Tùy chọn sau này:** đếm lượt bấm (`analytics event`), trang "Cảm ơn nhà hảo tâm" nếu người ủng hộ đồng ý hiển thị tên.

### 9.3 PWA (cài lên màn hình điện thoại)

- **Manifest** `src/app/manifest.ts`: `name`, `short_name`, `start_url: "/"`, `display: "standalone"`, `theme_color`, `lang: "vi"`, icon 192/512 và icon `maskable`.
- **Service worker** bằng **Serwist**:
  - App shell, JS/CSS/font/ảnh tĩnh: precache + `StaleWhileRevalidate`.
  - `GET /api/provinces`, `GET /api/venues`: cache ngắn (dữ liệu ít đổi).
  - **Không cache** API cần đăng nhập (`/api/me`, `/api/conversations`, tin nhắn) và mọi `POST/PATCH` – tránh lộ dữ liệu giữa các tài khoản trên cùng máy. Chat dùng `NetworkOnly`.
  - Trang offline `/offline`: "Không có mạng – bạn vẫn xem được các kèo đã mở gần đây".
- **Nút cài đặt** `InstallPrompt`: bắt `beforeinstallprompt` (Android/Chrome) rồi hiện banner nhỏ, người dùng có thể tắt (nhớ trong localStorage). **iOS Safari không có sự kiện này** nên hiện hướng dẫn "Chia sẻ → Thêm vào Màn hình chính".
- **Web Push** (tùy chọn, làm cùng bảng `Notification`): người dùng bật trong hồ sơ → `PushSubscription` lưu vào DB → server gửi bằng `web-push` (khóa VAPID trong env) khi có người nhận kèo, kèo được chấp nhận, tin nhắn mới. iOS chỉ hỗ trợ push khi PWA đã được **thêm vào màn hình chính**.
- **Cập nhật phiên bản:** khi có service worker mới, hiện toast "Có bản mới – Tải lại".
- **Lưu ý khi làm:** PWA bắt buộc HTTPS (Vercel và VPS + Caddy/Nginx đều đáp ứng). Cần kiểm tra Serwist tương thích với phiên bản Next.js và bundler (webpack/Turbopack) đang dùng; kiểm bằng Lighthouse.

### 9.4 Danh mục sân bóng & bản đồ

**Mục tiêu:** người đăng kèo chọn sân có sẵn theo tỉnh thay vì gõ tay; người nhận kèo xem được vị trí.

- **Dữ liệu:** bảng `Venue` (xem schema) – tên, địa chỉ, tỉnh, tọa độ, loại sân (5/7/11), SĐT, giá tham khảo.
- **Chọn sân trong form `/matches/new`:**
  1. Ô `VenuePicker` (shadcn `Command` / combobox) tự lọc theo **tỉnh đang chọn** + tìm theo tên (debounce, `GET /api/venues`).
  2. Sân hỗ trợ `format` đã chọn được xếp lên đầu.
  3. Không thấy sân → chọn **"Sân khác"**: nhập tay `venue` + `address` và tick "Gợi ý thêm vào danh mục" → tạo `Venue` ở trạng thái `PENDING`.
- **Bản đồ:**
  - Trang chi tiết kèo: bản đồ nhỏ bằng **react-leaflet + OpenStreetMap** (nạp động `dynamic(..., { ssr: false })` vì Leaflet cần `window`), kèm nút **"Chỉ đường"** mở `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`.
  - Trang danh sách: chế độ xem "Bản đồ" ghim các sân có kèo đang mở (tùy chọn, làm sau).
  - Ghi nguồn "© OpenStreetMap" theo điều khoản tile OSM; nếu lượng truy cập lớn thì chuyển sang nhà cung cấp tile trả phí.
- **Nạp dữ liệu ban đầu:** admin **import CSV** (`name,address,province_code,lat,lng,formats,phone`) ở `/admin/venues`; tọa độ có thể geocode một lần lúc import (Nominatim/Google Geocoding), không geocode theo từng request.
- **Kiểm duyệt:** sân user gợi ý ở `PENDING` chỉ người gợi ý thấy; admin duyệt → `APPROVED` mới hiện công khai. Chặn trùng bằng so khớp tên + tỉnh.
- **Tương thích ngược:** `Match.venue`/`address` (nhập tay) vẫn giữ để kèo không phụ thuộc vào danh mục.

### 9.5 Trang pháp lý & dữ liệu cá nhân

- **Trang bắt buộc:** `/terms`, `/privacy`, `/data-deletion`, link cố định ở footer. Google OAuth yêu cầu có URL Chính sách quyền riêng tư công khai khi đưa ứng dụng ra production.
- **Đồng ý khi đăng ký:** lần đăng nhập Google đầu tiên hiện màn hình "Tôi đồng ý Điều khoản & Chính sách" → lưu `User.termsAcceptedAt`. Chưa đồng ý thì chưa dùng được chức năng ghi (đăng kèo, chat).
- **Số Zalo:** ô nhập kèm checkbox riêng "Cho phép đối tác đã chốt kèo thấy số Zalo của tôi" → lưu `zaloConsentAt`; bỏ tick thì xóa quyền và ẩn nút Zalo ngay.
- **Dữ liệu thu thập** (nêu rõ trong chính sách): tên, email, ảnh đại diện từ Google; tỉnh/thành; SĐT Zalo (tùy chọn); tin nhắn; đánh giá. Mục đích, thời gian lưu, bên thứ ba nhận dữ liệu (Google, Vercel/VPS, Pusher/Ably, dịch vụ email, Sentry).
- **Quyền của người dùng:** xem/sửa hồ sơ, tải dữ liệu của mình (tùy chọn), **xóa tài khoản** (`DELETE /api/me`): đặt `deletedAt`, xóa email/SĐT/ảnh, đổi tên thành "Người dùng đã xóa", xóa subscription push; giữ tin nhắn/đánh giá ở dạng ẩn danh để không phá dữ liệu của đối tác.
- **Điều khoản** nên nêu: nền tảng chỉ kết nối, không phải bên tổ chức trận đấu, không chịu trách nhiệm về chấn thương, thanh toán tiền sân hay tranh chấp giữa người chơi; quy tắc ứng xử; quyền khóa tài khoản vi phạm; nội dung bị cấm (cá độ, cờ bạc, lừa đảo).
- **Cá cược:** vì tên miền "kèo", cần cấm rõ ràng nội dung cá độ/ăn tiền trong điều khoản và có từ khóa cảnh báo trong kiểm duyệt (mục 11).
- **Cơ sở pháp lý tại Việt Nam:** Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân (cần có sự đồng ý rõ ràng, thông báo mục đích xử lý, cho phép rút lại đồng ý). Nội dung chính sách và điều khoản nên được luật sư xem lại trước khi chạy thật; tài liệu này chỉ mô tả phần kỹ thuật cần hỗ trợ.

### 9.6 Đánh giá & uy tín (chống bùng kèo)

**Luồng:**
1. Kèo ở `MATCHED` và đã qua `kickoffAt + 3 tiếng` → cron tạo thông báo `RATE_PROMPT` cho cả hai bên.
2. Mở màn hình đánh giá (`/matches/[id]?rate=1`): **"Trận có diễn ra không?"**
   - **Có** → chấm 1–5 sao + nhận xét ngắn (tùy chọn).
   - **Không – đối tác bùng kèo** → `noShow = true` (bắt buộc ghi lý do ngắn).
   - **Không – hai bên tự hủy** → `happened = false`, không tính điểm cho ai.
3. Server cập nhật `ratingAvg`, `ratingCount`, `noShowCount` của người được đánh giá (tính lại trong một transaction).

**Quy tắc chống lạm dụng:**
- Chỉ hai bên của kèo `MATCHED` được đánh giá; mỗi người 1 lần / kèo (`@@unique([matchId, raterId])`); cho sửa trong 24 giờ.
- Báo bùng kèo chỉ tính vào `noShowCount` khi **đối tác không phản bác** hoặc admin xác nhận; nếu hai bên báo ngược nhau thì chuyển thành tranh chấp cho admin xem (`/admin/ratings`).
- Hiển thị điểm chỉ sau khi có ≥ 3 đánh giá (tránh một đánh giá quyết định tất cả); người mới hiện nhãn "Mới tham gia".
- Từ `noShowCount` ≥ 3 trong 90 ngày: gắn cảnh báo trên hồ sơ và kèo; nặng hơn thì admin có thể khóa.
- Đánh giá có nút báo cáo; admin gỡ đánh giá trả đũa/sai và ghi `AuditLog`.

**Hiển thị:** `MatchCard` và trang chi tiết kèo hiện ⭐ trung bình, số trận, số lần bùng kèo của chủ kèo; `/users/[id]` hiện chi tiết các nhận xét gần đây.

---

## 10. Cấu trúc thư mục

```
CapFootBall/
├─ docs/SYSTEM_DESIGN.md
├─ server.ts                     # (chỉ VPS) custom server gắn Socket.io
├─ Dockerfile · docker-compose.yml
├─ .github/workflows/ (ci.yml, deploy-vercel.yml, deploy-vps.yml)
├─ public/ (icons/, sw.js do Serwist sinh ra)
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts                    # seed Province
├─ src/
│  ├─ app/
│  │  ├─ (public)/page.tsx
│  │  ├─ matches/[id]/page.tsx
│  │  ├─ matches/new/page.tsx
│  │  ├─ messages/...
│  │  ├─ profile/page.tsx
│  │  ├─ (admin)/admin/            # trang quản lý (layout riêng)
│  │  │  └─ page.tsx · users/ · matches/ · reports/ · provinces/ · venues/ · ratings/ · donate/ · audit-logs/
│  │  └─ api/
│  │     ├─ provinces/route.ts
│  │     ├─ matches/route.ts
│  │     ├─ matches/[id]/route.ts
│  │     ├─ matches/[id]/requests/route.ts
│  │     ├─ requests/[id]/route.ts
│  │     ├─ conversations/...
│  │     ├─ realtime/auth/route.ts
│  │     ├─ me/route.ts
│  │     ├─ reports/route.ts
│  │     ├─ venues/route.ts
│  │     ├─ push/subscribe/route.ts
│  │     ├─ health/route.ts
│  │     ├─ admin/...               # users, matches, reports, provinces, stats
│  │     └─ cron/expire/route.ts
│  ├─ components/   (… DonateButton, ProvincePicker, MatchCard …)
│  ├─ constants/skill.ts
│  ├─ app/manifest.ts · app/sw.ts   # PWA
│  ├─ lib/ (prisma.ts, auth.ts, guards.ts, realtime/, ratelimit.ts)
│  ├─ schemas/                   # Zod
│  ├─ services/                  # logic nghiệp vụ, gọi Prisma
│  └─ stores/region.store.ts
└─ .env
```

Tách `route.ts` (mỏng: auth + validate) khỏi `services/` (logic) để dễ test.

---

## 11. Bảo mật & chất lượng

- Auth.js session (cookie httpOnly); kiểm quyền ở mọi route ghi (chỉ chủ kèo được sửa/duyệt).
- Zod validate input; Prisma chống SQL injection; escape khi render tin nhắn (React mặc định đã escape).
- Rate limit đăng kèo, gửi tin, nhận kèo.
- Không trả `phone`, `email`, `zaloPhone` ở API công khai; chỉ trả cho đối tác đã được chấp nhận.
- Chức năng báo cáo/chặn người dùng, ẩn kèo vi phạm.
- Index DB theo `(provinceCode, status, kickoffAt)` cho truy vấn chính.
- Logging lỗi (Sentry), test service bằng Vitest, e2e luồng chính bằng Playwright.

### 11.1 Vận hành: backup, giám sát, nhật ký

- **Backup MySQL**
  - Vercel + managed MySQL: bật **point-in-time recovery** của nhà cung cấp; thêm dump hằng tuần ra kho lưu trữ riêng.
  - VPS: cron `mysqldump --single-transaction` hằng ngày → nén → đẩy lên object storage (S3 / Cloudflare R2 / Backblaze B2); giữ 7 bản ngày + 4 bản tuần; mã hóa trước khi tải lên.
  - **Thử khôi phục định kỳ** (mỗi quý) vào DB tạm; backup chưa thử khôi phục coi như chưa có.
  - Bao gồm cả file `.env` (cất riêng, mã hóa) và ảnh người dùng tải lên.
- **Giám sát lỗi:** **Sentry** cho cả client và server (kèm `release` = commit SHA từ CI để biết lỗi thuộc bản nào).
- **Uptime:** UptimeRobot/Better Stack ping `GET /api/health` mỗi phút cho cả hai môi trường; báo qua email/Zalo/Telegram.
- **Log:** log có cấu trúc (pino) với `requestId`; trên VPS dùng `docker logs` + xoay vòng (`max-size`), cần thì đẩy về Loki/Better Stack. Không ghi nội dung tin nhắn hay token vào log.
- **Bảo mật vận hành:** VPS chỉ mở cổng 80/443/SSH, SSH bằng key, `ufw` + `fail2ban`, cập nhật OS tự động, MySQL không mở ra internet.
- **Kiểm duyệt tin nhắn:** lọc từ khóa (cá độ, link rút gọn lạ, SĐT/tài khoản lạ gửi dồn dập), giới hạn người mới nhắn cho nhiều người lạ trong 24 giờ, nút báo cáo ngay trong khung chat.

---

## 12. Lộ trình triển khai

| Giai đoạn | Nội dung |
|---|---|
| **M0b – CI/CD** | `ci.yml` ngay từ đầu; `deploy-vercel.yml` / `deploy-vps.yml` khi có bản chạy được đầu tiên |
| **M0 – Khởi tạo** | `create-next-app`, Tailwind, shadcn/ui, Prisma + MySQL, seed tỉnh/thành |
| **M1 – Khu vực & kèo** | ProvincePicker + lưu local, CRUD kèo, lọc theo tỉnh/trình độ |
| **M2 – Tài khoản** | Auth.js (Google), hồ sơ, đồng bộ tỉnh vào user |
| **M3 – Nhận kèo & chat** | MatchRequest, Conversation/Message, realtime, chấm chưa đọc |
| **M4 – Zalo & thông báo** | Nút Zalo sau khi chốt, email/push thông báo |
| **M1b – Sân bóng** | Model `Venue`, `VenuePicker` trong form đăng kèo, bản đồ Leaflet ở chi tiết kèo, `/admin/venues` + import CSV |
| **M3b – Thông báo** | Model `Notification`, hàm `notify()`, chuông + `/notifications`, email (Nodemailer SMTP), cron `tick` (nhắc giờ đá) |
| **M4a – Pháp lý** | `/terms`, `/privacy`, `/data-deletion`, màn đồng ý lần đầu, consent Zalo, `DELETE /api/me` |
| **M4e – Uy tín** | Model `Rating`, màn đánh giá sau trận, điểm uy tín trên thẻ kèo/hồ sơ, `/admin/ratings` |
| **M4b – Admin** | Role/ban, guards, `/admin` (dashboard, users, matches, reports, audit log), form báo cáo phía user |
| **M4c – Donate** | Model `DonateConfig`, `DonateButton` + modal QR, trang `/admin/donate` |
| **M4d – PWA** | Manifest, icon, Serwist, trang offline, `InstallPrompt`, (tùy chọn) Web Push |
| **M5 – Hoàn thiện** | Backup + khôi phục thử, Sentry, uptime, kiểm duyệt tin nhắn, SEO, tối ưu, deploy Vercel + VPS |

---

## 13. Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | **Kèo theo cá nhân.** Không có model Team; người dùng nhắn riêng cho nhau. `Match.teamName` là trường tùy chọn chỉ để hiển thị. |
| 2 | **Chỉ cấp tỉnh/thành**, không phường/xã. |
| 3 | **Đăng nhập chỉ bằng Google** (Auth.js Google provider). Không cần OTP SMS. |
| 4 | **Deploy cả hai**: Vercel (+ Pusher/Ably) và VPS (Docker + Socket.io). Xem mục 3.1. |
| 5 | **Một project duy nhất** (monolith Next.js): web, API, trang admin, realtime adapter cùng một repo. Không tách frontend/backend. |
| 6 | **Có trang quản lý `/admin`** trong cùng project, phân quyền theo `User.role`. Xem mục 9.1. |
| 7 | **Nút ủng hộ nhỏ** (donate) bằng QR/chuyển khoản, cấu hình trong admin, không dùng cổng thanh toán. Xem mục 9.2. |
| 8 | **CI/CD bằng GitHub Actions**: lint/test/build + `prisma migrate deploy` + tự deploy Vercel và VPS. Xem mục 3.2. |
| 9 | **Danh mục sân bóng theo tỉnh** + bản đồ OSM; user gợi ý sân mới, admin duyệt. Xem mục 9.4. |
| 10 | **PWA** cài lên màn hình điện thoại, có offline cơ bản và (tùy chọn) Web Push. Xem mục 9.3. |
| 11 | **Thông báo** (chuông + email + push) qua một hàm `notify()` duy nhất. Xem mục 8.3. |
| 12 | **Trang pháp lý & đồng ý dữ liệu cá nhân**, cho phép xóa tài khoản; cấm nội dung cá độ. Xem mục 9.5. |
| 13 | **Đánh giá & uy tín**: xác nhận trận có diễn ra, chấm sao, ghi nhận bùng kèo. Xem mục 9.6. |
| 14 | **Vận hành**: backup có thử khôi phục, Sentry, uptime, log có cấu trúc. Xem mục 11.1. |
