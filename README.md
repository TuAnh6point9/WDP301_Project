# Hệ thống WQI An Kim Hải

Web quản lý dữ liệu chất lượng nước lịch sử, trạm quan trắc và cổng tích hợp dự đoán WQI. Stack: TypeScript, React/Vite, Express và MongoDB/Mongoose.

Web hiện **chỉ có giao diện, chưa có dữ liệu**: các trang lấy dữ liệu qua `features/<module>/api.ts`, và các hàm này đang trả về danh sách rỗng (hoặc báo "chưa khả dụng" với thao tác ghi). Khi backend xong, thay phần thân từng hàm có đánh dấu `TODO(BE)` bằng lời gọi `http` (xem `client/src/lib/http.ts`), không cần sửa trang.

## Yêu cầu

- [Node.js](https://nodejs.org) 22 trở lên (kèm npm 10 trở lên)
- Trình duyệt Chrome, Edge hoặc Firefox
- Kết nối Internet để tải nền bản đồ và font chữ

## Chạy nhanh

Mở PowerShell tại thư mục dự án.

**1. Cài thư viện**, chỉ cần làm lần đầu hoặc khi `package-lock.json` thay đổi:

```powershell
npm ci
```

**2. Chạy web:**

```powershell
npm run dev:web
```

**3. Mở trình duyệt** tại **http://127.0.0.1:5173**.

Nên gõ đúng `127.0.0.1`: trên một số máy, `localhost` không mở được. Để dừng web, bấm `Ctrl + C` trong terminal.

### Đăng nhập (demo)

Chưa có backend nên đăng nhập chỉ là mô phỏng: không kiểm tra và không lưu mật khẩu nào trong code.

- **Log In**: vào với vai trò người dùng.
- **Continue as Admin (Demo)**: vào trang quản trị `/admin`.

### Các trang

| Khu vực | Đường dẫn | Nội dung (file thiết kế) |
|---|---|---|
| Công khai | `/` | Trang chủ (01) |
| | `/map` | Bản đồ trạm, chuyển Map / Satellite (02) |
| | `/historical-data` | Dữ liệu lịch sử, biểu đồ có đường giới hạn (03) |
| | `/calculate`, `/result` | Tính WQI và kết quả (04, 05) |
| | `/history` | Lịch sử tính WQI (06) |
| | `/report` | Xuất báo cáo PDF / Excel (13) |
| | `/login` | Đăng nhập (12) |
| Quản trị | `/admin` | Bảng điều khiển (07) |
| | `/admin/import` | Nhập dữ liệu Excel (17) |
| | `/admin/data` | Bản ghi quan trắc (15) |
| | `/admin/stations` | Trạm quan trắc, chọn tọa độ trên bản đồ (16) |
| | `/admin/users` | Tài khoản (14) |
| | `/admin/status` | Trạng thái hệ thống (18) |
| | `/admin/settings` | Cài đặt (19) |

Các màn hình mobile (08–11) thuộc ứng dụng di động, không nằm trong web.

## Nối dữ liệu thật

| File | Use case | Endpoint |
|---|---|---|
| `features/stations/api.ts` | Bản đồ, quản lý trạm | `/stations` |
| `features/water-records/api.ts` | Tra cứu, biểu đồ, quản lý bản ghi | `/water-records` |
| `features/imports/api.ts` | Import Excel, lịch sử import | `/imports` |
| `features/predictions/api.ts` | Tính WQI, kết quả, lịch sử tính | `/predictions` |
| `features/users/api.ts` | Quản lý tài khoản | `/users` |
| `features/system/api.ts` | Dashboard, trạng thái hệ thống | `/health`, `/predictions/status` |

Endpoint chi tiết ở `docs/openapi.yaml`. Đăng nhập hiện vẫn là mô phỏng (`features/auth/AuthContext.tsx`) để vào được trang quản trị.

## Deploy lên Vercel

1. Chạy `npm run build:web`.
2. Kéo thả thư mục `client/dist` vào dự án trên Vercel.

File `client/public/vercel.json` (được chép vào `dist` khi build) cấu hình điều hướng cho các trang và các header bảo mật: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy và HSTS.

## Các lệnh

| Lệnh | Tác dụng |
|---|---|
| `npm run dev:web` | Chạy web ở chế độ phát triển |
| `npm run build:web` | Build web vào `client/dist` để deploy |
| `npm run typecheck` | Kiểm tra lỗi TypeScript |
| `npm run lint` | Kiểm tra quy ước code |
| `npm test` | Chạy unit test của client |

## Cấu trúc thư mục

```text
WDP301_Project/
├── client/                     Web React 19 + Vite + TypeScript
│   └── src/
│       ├── app/                Router
│       ├── features/           Mỗi module nghiệp vụ một thư mục
│       │   └── <module>/       pages/ (màn hình), components/, api.ts (gọi dữ liệu), types.ts
│       │       auth · home · map · stations · water-records · imports
│       │       predictions · reports · users · system
│       ├── components/         Thành phần dùng chung: Icon, Modal, Brand, PageStatus, map/
│       ├── layouts/            Layout công khai (thanh trên) và quản trị (sidebar)
│       ├── lib/                http (axios), useAsync, wqi, format, csv
│       └── styles/             CSS của bản thiết kế
├── server/                     API Node.js + Express + MongoDB (nhóm backend phụ trách)
├── packages/contracts/         Kiểu dữ liệu dùng chung
└── docs/                       Yêu cầu, kiến trúc, dữ liệu, AI và OpenAPI
```

Quy ước:

- Trang chỉ lấy dữ liệu qua `features/<module>/api.ts`, không gọi `http` trực tiếp.
- Import sang thư mục khác dùng alias `@/` (ví dụ `@/components/Icon`, `@/features/stations/api`). Import trong cùng một module giữ dạng tương đối (`../api`, `../types`).
- Trang cần đăng nhập đặt trong nhóm `RequireAuth` ở `app/router.tsx`. Trang quản trị do `AdminLayout` kiểm tra quyền Admin.

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `npm` không được nhận diện | Cài Node.js, rồi mở lại terminal |
| Không mở được `localhost:5173` | Dùng `http://127.0.0.1:5173` |
| Báo `Port 5173 is already in use` | Web đang chạy ở terminal khác: tắt terminal đó hoặc dùng luôn trang đang mở |
| Bản đồ không hiện nền | Kiểm tra kết nối Internet |

Xem thêm: [kiến trúc](docs/architecture.md), [từ điển dữ liệu](docs/data-dictionary.md), [hợp đồng AI](docs/ai-contract.md) và [OpenAPI](docs/openapi.yaml).
