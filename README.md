<div align="center">

<img src="client/public/favicon.svg" width="72" alt="Biểu tượng WQI An Kim Hải">

# Hệ thống WQI An Kim Hải

[![Node](https://img.shields.io/badge/Node-22-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_8-47A248?style=flat&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-CatBoost-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Expo](https://img.shields.io/badge/Expo-SDK_58-000020?style=flat&logo=expo&logoColor=white)](https://expo.dev/)
[![CI](https://img.shields.io/github/actions/workflow/status/TuAnh6point9/WDP301_Project/ci.yml?branch=main&style=flat&label=CI)](https://github.com/TuAnh6point9/WDP301_Project/actions/workflows/ci.yml)

**[Mở bản chạy thật](https://wqi-project.vercel.app)** · [Bắt đầu nhanh](#bắt-đầu-nhanh) · [Lỗi thường gặp](#lỗi-thường-gặp)

</div>

**WQI An Kim Hải** là web theo dõi chất lượng nước khu vực An Kim Hải: tra cứu dữ liệu quan trắc theo đợt, xem trạm trên bản đồ và dự đoán chỉ số WQI bằng AI từ 6 chỉ số Coliforms, Amoni, PH, Phosphat, DO, COD. Đây là đồ án tốt nghiệp môn WDP301. Repo gồm web React, API Express/MongoDB, dịch vụ AI FastAPI/CatBoost (model **callisto 2.0**) và app Android Expo.

| Trang chủ | Bản đồ trạm |
|---|---|
| `[cần bổ sung: ảnh chụp màn hình]` | `[cần bổ sung: ảnh chụp màn hình]` |
| **Dự đoán WQI** | **Duyệt dữ liệu đo (Admin)** |
| `[cần bổ sung: ảnh chụp màn hình]` | `[cần bổ sung: ảnh chụp màn hình]` |

## Tính năng

**Khách (không cần đăng nhập)**

- **Trang chủ** `/`: giới thiệu WQI, khu vực An Kim Hải và bản đồ xem trước.
- **Bản đồ** `/map`: chỉ hiện trạm đang hoạt động, trạm có vòng sáng nhấp nháy (tự tắt khi máy bật giảm chuyển động). Bấm trạm để xem đợt đo đã duyệt mới nhất và 6 thông số. Có nền Goong, nền vệ tinh Esri và công tắc viền khu vực An Kim Hải; lựa chọn được nhớ và dùng chung cho Bản đồ, Admin và trang chủ.
- **Dữ liệu quan trắc** `/historical-data`: chọn trạm, từ đợt đến đợt; xem bảng và biểu đồ WQI theo mã đợt, đường giới hạn QCVN theo cột admin chọn; tải CSV.
- **Dự đoán WQI** `/calculate`: nhập 6 chỉ số theo thứ tự Coliforms → Amoni → PH → Phosphat → DO → COD. Kết quả hiện ở `/result/preview`, không lưu.
- Giao diện **Tiếng Việt / English** (mặc định tiếng Việt) và hướng dẫn từng bước tự mở lần đầu. Lựa chọn ngôn ngữ lưu ở `localStorage['wqi.language']`, đồng bộ giữa các tab. Đổi ngôn ngữ không đăng xuất, không xoá form, bộ lọc hay bản đồ, không gửi lại yêu cầu. Dữ liệu người dùng, mã trạm, tên cột Excel, đơn vị và giá trị lưu trong database không bị dịch.

**Người dùng đăng nhập (vai trò User hoặc Admin)**

- Kết quả dự đoán được lưu: xem lại ở `/result`, **Lịch sử** `/history` (xuất Excel theo trang).
- **Báo cáo** `/report`: bản in tiếng Việt, tải Excel 20 lần tính gần nhất.
- **Tính từ Excel**: bấm nút **Excel** ở `/calculate`, xem trước tại `/excel/:id`, lịch sử ở `/history/excel`.
- Không có trang tự đăng ký. Admin tạo tài khoản.

**Admin** (`/admin`)

- **Tổng quan** `/admin`: việc cần làm trong ngày.
- **Nhập dữ liệu Excel** `/admin/import`: nhập theo mã đợt, điền mã theo khoảng dòng, chọn ghi đè hoặc bỏ qua đợt trùng.
- **Duyệt dữ liệu đo** `/admin/data`: duyệt, từ chối, khoá bản ghi đã công bố (khoá cần lý do).
- **Trạm quan trắc** `/admin/stations`: tạo, sửa, ngừng, bật lại trạm; **Chi tiết trạm** `/admin/stations/details`. Phải chọn rõ Hải Dương hoặc Hải Phòng. Mã như `AH1` hay `AKH-06` đều hợp lệ. Sửa tên hay phân vùng không làm tròn lại toạ độ đã lưu. Không có trạng thái "bảo trì" riêng.
- **Tài khoản** `/admin/users`: tạo tài khoản, đổi tên, vai trò, mật khẩu, khoá hoặc mở lại.
- **Tình trạng hệ thống** `/admin/status`: Backend API, Database, AI Service.
- **Cài đặt** `/admin/settings`: chọn cột QCVN (A1, A2, B1, B2) cho đường giới hạn, hoặc không áp dụng.

Mọi thao tác ghi đều cần phiên đăng nhập và CSRF token (mã chống giả mạo yêu cầu). Đăng nhập và thao tác quản trị được ghi audit (nhật ký thao tác).

## Kiến trúc và công nghệ

| Thành phần | Công nghệ | Thư mục | Cổng local |
|---|---|---|---|
| Web | React 19, Vite 7, TypeScript, Leaflet + MapLibre (Goong), i18next | `client/` | 5173 |
| API | Express 5, Mongoose 8, express-session, helmet, Zod | `server/` | 5000 |
| Contracts | Zod schema và kiểu dữ liệu dùng chung cho web, API, app | `packages/contracts/` | — |
| AI | Python 3.12, FastAPI, uvicorn, CatBoost 1.2 | `ai/` | 8000 |
| Database | MongoDB local hoặc MongoDB Atlas | — | 27017 |
| App Android | Expo SDK 58, React Native, MapLibre native | `mobile/` | — |
| Kiểm thử | Vitest, Playwright, pytest | `e2e/`, `server/tests/`, `ai/tests/` | — |

Một lần dự đoán WQI đi qua các bước (sơ đồ: [docs/architecture.md](docs/architecture.md)):

1. Web kiểm tra 6 ô nhập (số hữu hạn ≥ 0, pH 0–14) và gắn cờ nhắc nếu số đáng ngờ.
2. Web gửi `POST /api/v1/predictions` (đã đăng nhập) hoặc `POST /api/v1/predictions/preview` (khách). Vite chuyển `/api` sang cổng 5000.
3. API kiểm tra lại dữ liệu, rồi gọi AI `POST /predict` tại `AI_SERVICE_URL`.
4. AI sắp 6 biến đúng thứ tự model và chạy CatBoost. Điểm ngoài 0–100 bị trả lỗi, không cắt.
5. API làm tròn half-up, xếp vào 6 hạng WQI. Nếu đã đăng nhập thì lưu kết quả kèm snapshot đầu vào và mã model.

## Cài đặt công cụ

Cài theo thứ tự trong bảng. Lệnh `winget` chạy trong PowerShell. Cài xong **mở lại terminal** để PATH (đường dẫn tìm lệnh) cập nhật.

| Công cụ | Cần khi nào | Phiên bản | Tải chính thức | Cài trên Windows | Kiểm tra → kết quả mong đợi |
|---|---|---|---|---|---|
| Git | Bắt buộc | bản mới | [git-scm.com](https://git-scm.com/downloads/win) | `winget install --id Git.Git -e` | `git --version` → `git version 2.x` |
| Node.js kèm npm | Bắt buộc | Node `>=22.19.0 <23`, npm `>=10` | [nodejs.org](https://nodejs.org/en/download) | `winget install --id OpenJS.NodeJS.22 -e` | `node -v` → `v22.x` (từ `v22.19.0`); `npm -v` → `10.x` |
| uv | Cần cho AI (dự đoán WQI, `ai:test`) | bản mới | [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) | `winget install --id astral-sh.uv -e` | `uv --version` → `uv 0.x`. Không cần cài Python: `ai:setup` để uv tự tải Python 3.12 |
| MongoDB Community Server | Bắt buộc nếu chạy database trên máy (hoặc dùng Atlas) | nhóm dùng 8.3 | [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community) | `winget install --id MongoDB.Server -e` | `Get-Service MongoDB` → `Status: Running` |
| mongosh | Không bắt buộc (xem dữ liệu bằng dòng lệnh) | bản mới | [mongodb.com/try/download/shell](https://www.mongodb.com/try/download/shell) | `winget install --id MongoDB.Shell -e` | `mongosh --version` → `2.x` |
| Tài khoản MongoDB Atlas | Thay cho MongoDB local | — | [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) | Đăng ký trên web | Sau khi cấu hình: `npm run db:status` → `"state": "connected"` |
| Android Studio | Chỉ khi build app Android | có sẵn JDK 21 (`jbr`) | [developer.android.com/studio](https://developer.android.com/studio) | `winget install --id Google.AndroidStudio -e` | `& "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" -version` → `21.x` |

> [!NOTE]
> `package.json` > `engines` yêu cầu Node 22, nhưng `.nvmrc`, `.node-version` ghi `24.12.0` và CI chạy Node 24. Dùng Node 22 để khớp `engines`. Với Node 24, `npm ci` chỉ cảnh báo `EBADENGINE`, vẫn cài được.

> **Kiểm tra:** mở terminal mới, chạy `git --version; node -v; npm -v; uv --version` và thấy đủ 4 dòng phiên bản như bảng.
> **Nếu lỗi:** xem [Lỗi thường gặp](#lỗi-thường-gặp).

## Bắt đầu nhanh

Làm lần đầu thì đi theo 12 bước bên dưới. Đã có đủ công cụ, MongoDB local đang chạy và có file model thì chạy khối này ở thư mục gốc repo:

```powershell
npm ci
npm run ai:setup
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
if (-not (Test-Path client/.env)) { Copy-Item client/.env.example client/.env }
# Điền SESSION_SECRET trong server/.env (xem bước 6), rồi:
npm run build -w @wqi/contracts
npm run db:indexes
npm run ai:import -- --source "<duong-dan-model.cbm>"
npm run admin:create
npm run dev:wqi
```

**1. Tải mã nguồn.** Thư mục: nơi bạn muốn đặt dự án, ví dụ `D:\`.

```powershell
git clone https://github.com/TuAnh6point9/WDP301_Project.git
cd WDP301_Project
```

Từ bước 2 trở đi, mọi lệnh chạy ở thư mục gốc `WDP301_Project`, trừ khi ghi khác.

> **Kiểm tra:** `git status` → `On branch main` và `nothing to commit, working tree clean`.

**2. Cài thư viện web + API + contracts (bắt buộc).** Thư mục: gốc.

```powershell
npm ci
```

Lệnh này cài đúng phiên bản trong `package-lock.json` cho 3 workspace `packages/contracts`, `server`, `client`, kèm công cụ phát triển (TypeScript, Vite, Vitest, ESLint, thư viện Playwright).

> **Kiểm tra:** lệnh kết thúc bằng `added … packages`, không có dòng `npm error`.

**3. Cài môi trường AI (cần để dự đoán WQI).** Thư mục: gốc.

```powershell
npm run ai:setup
```

uv tạo môi trường ảo `ai/.venv` với Python 3.12 (tự tải nếu máy chưa có), rồi cài FastAPI, CatBoost, uvicorn, pytest… theo `ai/requirements.txt`. Bỏ qua bước này thì web vẫn chạy, chỉ phần dự đoán không dùng được.

> **Kiểm tra:** `ai\.venv\Scripts\python.exe --version` → `Python 3.12.x`.

**4. Cài thư viện app Android (chỉ khi làm app).** Thư mục: `mobile/`.

```powershell
cd mobile; npm install; cd ..
```

Cài Expo, React Native, MapLibre… theo lockfile riêng của `mobile/`. CI cũng cài phần này (`npm ci --prefix mobile`) trước khi chạy kiểm thử, vì `npm test` ở gốc chạy cả test trong `mobile/src`.

> **Kiểm tra:** `Test-Path mobile/node_modules/expo` → `True`.

**5. Cài trình duyệt cho E2E (chỉ khi chạy `npm run test:e2e` hoặc test real-service).** Thư mục: gốc.

```powershell
npx playwright install chromium
```

> **Kiểm tra:** `Test-Path "$env:LOCALAPPDATA\ms-playwright"` → `True`.

**6. Tạo file cấu hình.** Thư mục: gốc. Chỉ sao chép khi chưa có `.env`, để không ghi đè cấu hình cũ.

```powershell
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
if (-not (Test-Path client/.env)) { Copy-Item client/.env.example client/.env }
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Mở `server/.env`, dán chuỗi 64 ký tự vừa in vào `SESSION_SECRET=`. Các giá trị còn lại giữ nguyên là chạy được với MongoDB local. Ý nghĩa từng biến: [Cấu hình môi trường](#cấu-hình-môi-trường).

> **Kiểm tra:** `Select-String -Path server/.env -Pattern '^SESSION_SECRET=.{32,}'` in ra một dòng.

**7. Build contracts.** Thư mục: gốc. Web, API và app đều đọc `packages/contracts/dist`, nên bước này phải chạy trước.

```powershell
npm run build -w @wqi/contracts
```

> **Kiểm tra:** `Test-Path packages/contracts/dist/index.js` → `True`.

**8. Tạo index database.** Thư mục: gốc. MongoDB phải đang chạy.

```powershell
npm run db:indexes
npm run db:status
```

`db:indexes` chỉ tạo index còn thiếu, không thêm hay xoá dữ liệu. MongoDB tự tạo database khi ghi lần đầu.

> **Kiểm tra:** `db:indexes` in `Database indexes created. Existing data was preserved.`; `db:status` in `"database": "akh_wqi_local"` và `"state": "connected"`.

**9. Nhập model AI.** Thư mục: gốc. File model `.cbm` không có trong repo, được bàn giao riêng (nơi nhận: `[cần bổ sung]`).

```powershell
npm run ai:import -- --source "D:\duong-dan\model.cbm"
```

Lệnh kiểm tra model khớp `ai/catboost.manifest.json` (SHA-256, tên biến) rồi chép vào `.local/ai/catboost/model.cbm` kèm `manifest.json`. Nếu hai file này đã có thì bỏ qua bước này.

> **Kiểm tra:** `Test-Path .local/ai/catboost/model.cbm` → `True`. Sau bước 11, mở http://127.0.0.1:8000/health → HTTP 200.

<details>
<summary>Chưa có file model <code>.cbm</code> thì sao?</summary>

Bỏ qua bước 9. Web và API vẫn chạy bình thường: bản đồ, dữ liệu quan trắc, đăng nhập, admin đều dùng được. Chỉ phần dự đoán WQI báo AI chưa sẵn sàng. Nếu chạy `npm run dev:wqi`, tiến trình AI vẫn lên nhưng `/health` trả 503. Muốn tắt hẳn AI thì đặt `AI_MODE=disabled` trong `server/.env` và chạy `npm run dev`.

</details>

**10. Tạo tài khoản admin (chỉ chạy một lần).** Thư mục: gốc.

```powershell
npm run admin:create
```

Lệnh hỏi tên, email và mật khẩu (tối thiểu 12 ký tự, gõ không hiện). Chạy lại với email đã có thì báo `Account already exists. No changes made.` Repo không kèm dữ liệu quan trắc, tài khoản hay mật khẩu nào.

> **Kiểm tra:** thấy `Admin account created. No station or measurement data was added.`; `npm run db:status` cho `users` có `"documents": 1`.

**11. Chạy hệ thống.** Thư mục: gốc.

```powershell
npm run dev:wqi   # web + API + AI
# hoặc
npm run dev       # chỉ web + API
```

`dev:wqi` bật AI ở cổng 8000 và ép API gọi AI qua HTTP. Lệnh này chỉ chạy với database riêng `akh_wqi_local` tại `127.0.0.1:27017` (khớp file mẫu). Web chờ API sẵn sàng rồi mới khởi động. Bấm `Ctrl+C` để dừng tất cả.

> **Kiểm tra:** mở http://localhost:5173 (hoặc http://127.0.0.1:5173) thấy trang chủ; http://localhost:5000/api/v1/health/ready trả `{"data":{"database":"connected"}}`; http://127.0.0.1:8000/health trả JSON (chỉ với `dev:wqi`).
> **Nếu lỗi:** xem [Lỗi thường gặp](#lỗi-thường-gặp).

<details>
<summary>Chạy AI và API ở hai terminal riêng (khi dùng Atlas hoặc database khác)</summary>

`dev:wqi` từ chối mọi `MONGODB_URI` khác `akh_wqi_local` local. Khi đó đặt trong `server/.env`:

```dotenv
MONGODB_URI=<chuỗi kết nối của bạn>
AI_MODE=http
AI_SERVICE_URL=http://127.0.0.1:8000/predict
```

Rồi mở hai terminal ở thư mục gốc:

```powershell
npm run ai:dev    # terminal 1: AI ở 127.0.0.1:8000
npm run dev       # terminal 2: contracts + API + web
```

</details>

**12. Đăng nhập.** Mở http://localhost:5173/login bằng tài khoản ở bước 10, vào **Admin** để tạo trạm và tài khoản người dùng.

## Cấu hình môi trường

Có 3 file cấu hình, mỗi file sao chép từ `.env.example` cùng thư mục. Chỉ sao chép khi chưa có `.env`. Các file `.env` đã được Git bỏ qua, không commit chúng.

```powershell
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
if (-not (Test-Path client/.env)) { Copy-Item client/.env.example client/.env }
if (-not (Test-Path mobile/.env)) { Copy-Item mobile/.env.example mobile/.env }   # chỉ khi làm app
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"    # sinh SESSION_SECRET
```

**`server/.env`** (API đọc khi khởi động; sai kiểu thì API dừng và báo `Invalid environment: <tên biến>`)

| Biến | Bắt buộc | Ý nghĩa | Giá trị mẫu local | Lấy ở đâu | Bỏ trống hoặc sai thì sao |
|---|---|---|---|---|---|
| `NODE_ENV` | Không | `development`, `test` hoặc `production` | `development` | Giữ nguyên | Trống: `development`. `production` bật cookie `secure` (chỉ HTTPS) và phục vụ web đã build |
| `PORT` | Không | Cổng API | `5000` | Giữ nguyên | Trống: 5000. Đổi cổng thì phải đặt thêm `API_PROXY_URL` cho Vite, nếu không web không gọi được API |
| `MONGODB_URI` | Có | Chuỗi kết nối MongoDB | `mongodb://127.0.0.1:27017/akh_wqi_local?directConnection=true` | Local: giữ mẫu. Atlas: xem khối gập bên dưới | Trống hoặc không bắt đầu bằng `mongodb://`/`mongodb+srv://`: API không khởi động. Sai máy chủ: API không lên, web chờ mãi |
| `MONGODB_DNS_FALLBACK` | Không | Cho Atlas: thử DNS qua HTTPS khi DNS máy lỗi | `https` | Giữ nguyên | `none` tắt tính năng. Giá trị khác: API không khởi động |
| `CLIENT_ORIGIN` | Không | Danh sách origin (địa chỉ web) được phép, cách nhau bằng dấu phẩy | như file mẫu | Thêm tên miền web khi triển khai | Thiếu địa chỉ đang mở web: đăng nhập và mọi thao tác ghi bị chặn 403 `ORIGIN_REJECTED` |
| `SESSION_SECRET` | Có | Khoá ký cookie phiên đăng nhập | chuỗi 64 ký tự từ lệnh `node -e` ở trên | Tự sinh | Trống hoặc dưới 32 ký tự: API không khởi động. Đổi giá trị: mọi người bị đăng xuất |
| `AI_MODE` | Không | `http` gọi dịch vụ AI, `disabled` tắt AI | `http` | Giữ nguyên | Trống: `disabled`, trang dự đoán báo AI chưa sẵn sàng |
| `AI_SERVICE_URL` | Có khi `AI_MODE=http` | Địa chỉ `POST /predict` của AI | `http://127.0.0.1:8000/predict` | Local giữ mẫu; Render: URL dịch vụ AI | Không bắt đầu bằng `http(s)://`: API báo `AI_SERVICE_URL must be an HTTP URL`. AI không chạy: dự đoán lỗi 502 |
| `AI_API_KEY` | Không (local) | Khoá gửi kèm `Authorization: Bearer` tới AI | để trống | Render tự sinh và chia cho cả hai dịch vụ | Phải giống `AI_API_KEY` của AI. Lệch: AI trả 401 `AI_UNAUTHORIZED` |
| `AI_TIMEOUT_MS` | Không | Thời gian chờ AI (100–60000 ms) | `10000` | Giữ nguyên | Ngoài khoảng: API không khởi động. Quá ngắn: dự đoán lỗi 504 |
| `TRUST_PROXY` | Không | Số proxy đứng trước API (0–5) | `0` | Render dùng `2` (Vercel + Render) | Đặt `0` khi chạy production sau proxy HTTPS: cookie phiên không được gửi, không đăng nhập được; giới hạn tần suất tính sai IP |

`npm run dev:wqi` tự ghi đè `AI_MODE=http` và `AI_SERVICE_URL=http://127.0.0.1:8000/predict`. Chỉ cần tự đặt hai biến này khi chạy `npm run dev` kèm `npm run ai:dev`, hoặc khi triển khai.

**`client/.env`** (Vite đọc khi khởi động; đổi xong phải tắt và chạy lại `npm run dev`)

| Biến | Bắt buộc | Ý nghĩa | Giá trị mẫu local | Lấy ở đâu | Bỏ trống hoặc sai thì sao |
|---|---|---|---|---|---|
| `VITE_API_BASE_URL` | Không | Đường dẫn API mà web gọi | `/api/v1` | Giữ nguyên (Vite và Vercel đều chuyển `/api/v1` tới API) | Sai: mọi trang không tải được dữ liệu |
| `VITE_GOONG_MAPTILES_KEY` | Không | Khoá **Maptiles Key** của Goong cho nền bản đồ | để trống | [account.goong.io/keys](https://account.goong.io/keys), chọn Maptiles Key (không phải REST API Key), giới hạn theo tên miền | Trống, sai hoặc Goong lỗi: tự dùng nền Esri World Topo. Nền vệ tinh luôn là Esri World Imagery |

Mọi biến `VITE_*` lộ ra trình duyệt. Khoá Goong chỉ nằm trong `client/.env`, không đưa vào file nào được commit.

**`mobile/.env`** (giá trị được build cứng vào APK)

| Biến | Bắt buộc | Ý nghĩa | Giá trị mẫu | Bỏ trống hoặc sai thì sao |
|---|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | Có | API mà app gọi | `https://wqi-project.vercel.app/api/v1`; máy ảo gọi server trên máy: `http://10.0.2.2:5055/api/v1` | Sai: app không tải được dữ liệu, phải build lại APK |
| `EXPO_PUBLIC_GOONG_MAPTILES_KEY` | Không | Giống `VITE_GOONG_MAPTILES_KEY` | để trống | Trống: nền Esri |

<details>
<summary>Dùng MongoDB Atlas thay vì MongoDB local</summary>

1. Tạo project và cluster trên Atlas.
2. **Database Access**: tạo user riêng cho ứng dụng, chỉ cấp `readWrite` trên database `akh_wqi`.
3. **Network Access**: cho phép IP của máy bạn hoặc của server. Chỉ dùng `0.0.0.0/0` khi nền tảng không có IP cố định.
4. **Connect → Drivers → Node.js**, lấy URI dạng `mongodb+srv://`. Mật khẩu có ký tự đặc biệt thì percent-encode (mã hoá `%xx`).
5. Đặt vào `server/.env` (không sửa `server/.env.example`):

   ```dotenv
   MONGODB_URI=mongodb+srv://APP_USER:PERCENT_ENCODED_PASSWORD@CLUSTER.mongodb.net/akh_wqi?retryWrites=true&w=majority
   ```

6. Chạy `npm run db:status`, `npm run db:indexes`. Database mới chưa có tài khoản, nên chạy thêm `npm run admin:create`.
7. Chạy AI và API ở hai terminal (khối gập ở bước 11), vì `dev:wqi` chỉ nhận `akh_wqi_local`.

Khác biệt với local: local dùng `mongodb://127.0.0.1:27017/...` và không cần mật khẩu; Atlas dùng `mongodb+srv://`, cần user/mật khẩu, IP được phép và DNS phân giải được bản ghi SRV. Nếu nhóm dùng chung một Atlas, mọi thao tác ghi khi phát triển sẽ đổi dữ liệu thật. Chi tiết: [docs/mongodb-atlas-deployment.md](docs/mongodb-atlas-deployment.md).

</details>

> **Kiểm tra:** `npm run db:status` in `"state": "connected"`; chạy `npm run dev` không thấy dòng `Invalid environment`.
> **Nếu lỗi:** xem [Lỗi thường gặp](#lỗi-thường-gặp).

## Bảng lệnh npm

Chạy ở thư mục gốc. Đủ 20 script trong `package.json`.

| Lệnh | Làm gì | Khi nào dùng |
|---|---|---|
| `npm run dev` | Build contracts, chạy contracts (watch), API (5000) và web (5173) | Phát triển hằng ngày, không cần AI hoặc AI chạy riêng |
| `npm run dev:web` | Build contracts rồi chỉ chạy web | Sửa giao diện khi API chạy ở nơi khác |
| `npm run dev:wqi` | Như `dev`, thêm AI (8000); chỉ nhận database `akh_wqi_local` local | Chạy đủ hệ thống trên máy |
| `npm run ai:setup` | Tạo `ai/.venv` (Python 3.12) bằng uv và cài `ai/requirements.txt` | Lần đầu, hoặc khi `requirements.txt` đổi |
| `npm run ai:import -- --source "<file.cbm>"` | Kiểm tra và chép model vào `.local/ai/catboost/` | Khi nhận model mới. Thêm `--verify-only` để chỉ kiểm tra |
| `npm run ai:train` | Chạy quy trình huấn luyện lưu trữ của Callisto 1.0 | Hiếm khi; xem khối gập ở mục Dữ liệu |
| `npm run ai:dev` | Chạy AI ở `127.0.0.1:8000`, đọc model tại `WQI_MODEL_PATH` (mặc định `.local/ai/catboost/model.cbm`) | Khi chạy AI riêng với `npm run dev` |
| `npm run ai:test` | Chạy pytest cho `ai/tests` | Sau khi sửa `ai/` |
| `npm run build:web` | Build contracts và web ra `client/dist` | Giống lệnh build của Vercel |
| `npm run build` | Build contracts, server (`server/dist`) và web | Trước `npm start` và test real-service |
| `npm start` | Chạy API đã build, kèm phục vụ web từ `client/dist` tại cổng 5000 | Thử bản build như production |
| `npm run typecheck` | Kiểm tra kiểu TypeScript mọi workspace | Trước khi mở pull request |
| `npm run lint` | ESLint toàn repo | Trước khi mở pull request |
| `npm test` | Vitest: test của client, contracts, server và `mobile/src` | Sau mỗi thay đổi |
| `npm run test:e2e` | Playwright với web đang chạy (mặc định `http://localhost:5173`) | Kiểm thử đầu cuối trên trình duyệt thật |
| `npm run db:indexes` | Tạo index còn thiếu, giữ nguyên dữ liệu | Database mới, hoặc sau khi thêm model/index |
| `npm run db:sync-import-indexes` | Xoá index nhập dữ liệu kiểu cũ, giữ dữ liệu | Một lần cho mỗi database có dữ liệu từ trước khi nhập theo mã đợt |
| `npm run db:status` | In máy chủ, tên database, số document từng collection (không in mật khẩu) | Kiểm tra kết nối |
| `npm run db:local` | Nạp file Excel AKH-5_2026 vào `akh_wqi_local`, tạo admin local, chuyển `server/.env` sang database local | Dựng database local có dữ liệu gốc (xem ghi chú dưới) |
| `npm run admin:create` | Hỏi tên, email, mật khẩu rồi tạo một admin | Một lần cho mỗi database |

Ghi chú về `db:local`: mặc định đọc `%USERPROFILE%\Downloads\AKH-5_2026 (1).xlsx` (không có trong repo). Lệnh tạo admin `admin.local@wqi.local`, lưu mật khẩu vào `.local/local-admin.json`, xuất `.local/datasets/AKH-5_2026.raw.json`, sao lưu `.env` cũ thành `server/.env.atlas.local` và đặt `AI_MODE=disabled`. Muốn dùng AI với `npm run dev` sau đó thì sửa lại `AI_MODE=http`.

Lệnh của từng workspace dùng `-w`, ví dụ `npm run build -w @wqi/contracts`, `npm run typecheck -w @wqi/client`.

## Cấu trúc thư mục

```text
WDP301_Project/
├─ client/              Web React: src/ (giao diện), public/ (ảnh, favicon, vercel.json)
├─ server/              API Express: src/ (module, middleware, scripts), tests/
├─ packages/contracts/  Zod schema và kiểu dùng chung, build ra dist/
├─ ai/                  Dịch vụ AI FastAPI + CatBoost, tests/, catboost.manifest.json
├─ mobile/              App Android Expo, ngoài workspaces, có package-lock.json riêng
├─ e2e/                 Kiểm thử Playwright
├─ scripts/             run-ai.mjs, run-local-api.mjs, wait-for-api.mjs
├─ docs/                Tài liệu kỹ thuật dùng chung
├─ .github/workflows/   ci.yml
├─ render.yaml          Blueprint Render cho API và AI
├─ vercel.json          Build, rewrite và CSP của web trên Vercel
└─ package.json         Workspaces và toàn bộ script
```

Git bỏ qua: mọi `.env`, `.local/` (model, dữ liệu, cache uv), `ai/.venv/`, `node_modules/`, các thư mục `dist/`, `playwright-report/`, `test-results/` và `docs/local/` (ghi chú làm việc riêng). Model và dữ liệu chạy máy để trong `.local/`, không đưa vào tài liệu.

## Kiểm thử

Luôn chạy ở **thư mục gốc**. Chạy Vitest bên trong `client/` sẽ đọc khoá Goong thật trong `client/.env` và làm một số test bản đồ báo lỗi sai.

```powershell
npm run typecheck
npm run lint
npm test
npm run ai:test
npm run build
npm run test:e2e
```

| Lệnh | Cần có trước |
|---|---|
| `npm run typecheck`, `npm run lint` | `npm ci`. CI cài cả `npm ci --prefix mobile` trước; làm giống để kết quả khớp |
| `npm test` | `npm ci`, `npm ci --prefix mobile`. Lần đầu cần Internet: `mongodb-memory-server` tự tải MongoDB tạm cho test |
| Test real-service trong `npm test` (ví dụ `server/tests/prediction-batch-real.test.ts`) | Model ở `.local/ai/catboost/`, `npm run ai:setup`, `npm run build`, Chromium. Thiếu model thì test tự bỏ qua. Dùng database tạm riêng |
| `npm run ai:test` | `npm run ai:setup`. Test cần model riêng tự bỏ qua khi chưa có model |
| `npm run build` | `npm ci` |
| `npm run test:e2e` | Hệ thống đang chạy (`npm run dev:wqi`), Chromium (bước 5), biến `E2E_EMAIL`, `E2E_PASSWORD` (hoặc file `.local/local-admin.json` do `db:local` tạo). Thiếu tài khoản thì bài E2E bị bỏ qua |

Đặt biến trong terminal rồi chạy: `$env:E2E_EMAIL = '<email>'; $env:E2E_PASSWORD = '<mật khẩu>'; npm run test:e2e`. Biến tuỳ chọn: `E2E_BASE_URL` (đổi địa chỉ web), `E2E_CHANNEL=chrome` (dùng Chrome cài sẵn). E2E đăng nhập thật và tạo một lần dự đoán mới, nên không chạy trên database dùng chung. Chạy riêng luồng Excel toàn phần: `node node_modules/vitest/vitest.mjs run server/tests/prediction-batch-real.test.ts`; kết quả đo và ảnh chụp lưu vào `docs/local/` trên máy chạy test. Test đạt chỉ chứng minh code chạy đúng, không chứng minh độ chính xác của model.

> **Kiểm tra:** mỗi lệnh kết thúc không có bài `failed`; bài `skipped` chỉ được phép vì thiếu model, thiếu tài khoản E2E hoặc thiếu Chromium.

## App Android

App Expo (SDK 58) có các chức năng phía người dùng của web (không có `/admin`), dùng lại code trong `client/src`.

1. Build contracts ở gốc: `npm run build -w @wqi/contracts`.
2. Cài thư viện: `cd mobile; npm install`.
3. Sao chép `mobile/.env.example` thành `mobile/.env`, điền `EXPO_PUBLIC_API_URL` và khoá Goong (bảng ở mục Cấu hình).
4. Chạy trên máy ảo: `npm run android` (build, cài và mở Metro). Expo Go không chạy được vì MapLibre là code native.
5. Build APK: đặt `JAVA_HOME` tới `jbr` của Android Studio, chạy `npx expo prebuild -p android --no-install`, rồi `cd android; ./gradlew.bat assembleRelease`.
6. File APK: `mobile/android/app/build/outputs/apk/release/app-release.apk` (ký bằng debug key, cài được, không đưa lên Play Store).

Chi tiết và lưu ý đường dẫn dài trên Windows: [mobile/README.md](mobile/README.md).

## Triển khai

| Dịch vụ | Chạy gì | File cấu hình | Biến cần đặt trên dashboard |
|---|---|---|---|
| Vercel (web) | `npm ci`, `npm run build:web`, phục vụ `client/dist`. Chuyển `/api/v1/*` sang API trên Render, mọi đường dẫn khác về `index.html` | `vercel.json` | `VITE_GOONG_MAPTILES_KEY` (`VITE_API_BASE_URL` không cần, mặc định `/api/v1`) |
| Render `wqi-ankimhai-api` (Node) | Build contracts + server, chạy `npm run start -w @wqi/server`, kiểm tra sống ở `/api/v1/health/live` | `render.yaml` | `MONGODB_URI` (tự điền). Blueprint tự đặt `NODE_ENV`, `SESSION_SECRET`, `CLIENT_ORIGIN`, `TRUST_PROXY`, `AI_MODE`, `AI_SERVICE_URL`, `AI_API_KEY`, `AI_TIMEOUT_MS` |
| Render `wqi-ankimhai-ai` (Python) | `pip install -r ai/requirements.txt`, giải mã model rồi chạy uvicorn, kiểm tra ở `/health` | `render.yaml` | Secret file `model.cbm.b64` (model mã hoá base64). Blueprint tự đặt `PYTHON_VERSION`, `WQI_MODEL_PATH`, `WQI_MODEL_MANIFEST`, `OMP_NUM_THREADS`, `AI_API_KEY` |
| GitHub Actions (CI) | Mỗi push và pull request: `npm ci`, `npm ci --prefix mobile`, typecheck, lint, test, `build:web` (Node 24); `pytest ai/tests` (Python 3.12) | `.github/workflows/ci.yml` | Không cần biến bí mật; test cần model tự bỏ qua |

- Tạo file `model.cbm.b64` trên Windows: `[Convert]::ToBase64String([IO.File]::ReadAllBytes('model.cbm')) | Out-File model.cbm.b64 -Encoding ascii -NoNewline`. Không commit file này.
- Gói free của Render ngủ khi không có truy cập; yêu cầu đầu tiên sau đó mất khoảng 1 phút.
- Sau khi thêm model hoặc index mới, chạy `npm run db:indexes` với `MONGODB_URI` của production. Database có dữ liệu nhập từ trước thì chạy thêm `npm run db:sync-import-indexes` một lần.
- Nhánh deploy của cả ba dịch vụ là `main`: push lên `main` là lên bản chạy thật.

> **Kiểm tra:** `GET /api/v1/health/live` và `/api/v1/health/ready` trên tên miền web trả 200; trang **Tình trạng hệ thống** của admin báo cả 3 thành phần hoạt động.

## Dữ liệu và giới hạn của model

- API nhận 6 khoá `coliform, nh4, ph, po4, do, cod`, ánh xạ sang tên trong model `Coliforms, Amoni, PH, Phosphat, DO, COD`. `nh4` là khoá kỹ thuật của Amoni, `po4` của Phosphat; tên khoá không chứng minh đơn vị theo N hay P.
- Dùng giá trị nguồn, không quy đổi đơn vị. Metadata ghi `unitStatus=unverified`, `referenceBasis=lecturer-provided`: đơn vị, nguồn nhãn và độ chính xác độc lập của model chưa được xác minh.
- Tiền xử lý v1: dấu `,` đọc là `.`; `<x` (dưới ngưỡng phát hiện) tính bằng x; `KPH` hoặc ô trống báo lỗi; không log, không chuẩn hoá, không cắt, không điền thiếu. Cờ đỏ (nghi gõ nhầm) và cam (ngoài vùng model học tốt) chỉ nhắc, không chặn.
- Điểm thô phải là số hữu hạn trong 0–100, nếu không thì báo `AI_OUTPUT_OUT_OF_RANGE` và bỏ, không cắt về giới hạn. Điểm hợp lệ được làm tròn half-up rồi xếp vào 6 hạng (mốc 91/76/51/26/10).
- Tám cột quan trắc gốc (`PH, Temp, BOD5, COD, DO, Amoni, Phosphat, Coliforms`) vẫn được lưu nguyên. Lần tính cũ giữ BOD5, đơn vị, kết quả và mã model cũ; trang Lịch sử, Kết quả và file xuất hiển thị theo snapshot của từng lần.
- Từ 06/11/2026, giao diện và file tải về không hiện tên hay mã model. File Excel/CSV và trang Báo cáo in luôn bằng tiếng Việt, dù giao diện đang ở ngôn ngữ nào.
- Callisto 1.0 được giữ offline, không dùng làm dự phòng. Chi tiết: [docs/ai-contract.md](docs/ai-contract.md), [ai/MODEL_CARD.md](ai/MODEL_CARD.md).

**Tính WQI từ Excel (xử lý nền theo đợt)**

- Nhận file `.xlsx` một sheet, tối đa 5 MB và 10.000 dòng dữ liệu. Hàng đầu cần đủ 6 cột `Coliforms, Amoni, PH, Phosphat, DO, COD`, thứ tự tuỳ ý; tên cột không được trùng.
- Ô số hoặc số gõ dạng chữ (`7,2`, `<0,05`) đều đọc được; ô công thức, ô trống, `KPH` bị báo lỗi theo dòng. Xem trước rồi xác nhận để tính các dòng hợp lệ. Giới hạn đơn vị và model áp dụng như khi nhập tay.
- `Temp`, `BOD5`, `Mã đợt`, `Mã trạm`, `Ghi chú` là tuỳ chọn, chỉ để ghi lại vào file kết quả. Cột khác bị bỏ qua.
- Mỗi tài khoản có tối đa một đợt đang chờ hoặc đang chạy. Có thể rời trang khi đang chạy; mất kết nối AI thì mở lại và bấm **Tiếp tục**.
- Worker (tiến trình chạy nền trong API) xử lý 100 dòng mỗi lượt, không cần Redis. API dừng đột ngột thì đợt đang chạy được nhận lại sau khi lease (khoá tạm) hết hạn, tối đa khoảng 2 phút. API tự tạo index cho hai collection của đợt.
- File kết quả có mọi dòng, WQI, phân loại, lý do lỗi và sheet `Thông tin`; chỉ tải được khi đợt hoàn tất. User và Admin chỉ thấy đợt của mình. Kết quả không được công bố lên bản đồ.
- Sau khi cập nhật code, khởi động lại cả API và AI.

<details>
<summary>Huấn luyện lại model bằng <code>ai:train</code></summary>

`npm run ai:train` chạy `ai/train.py`, là quy trình huấn luyện **lưu trữ của Callisto 1.0** với bộ biến và đơn vị cũ. Lệnh này **không** tạo ra được bản CatBoost đang dùng và không cần cho việc chạy hệ thống.

Nếu vẫn cần chạy để nghiên cứu:

1. Có file dữ liệu `.local/datasets/AKH-5_2026.raw.json` (không có trong repo; `npm run db:local` tạo ra nó từ file Excel gốc).
2. Chạy, với hai tham số bắt buộc:

   ```powershell
   npm run ai:train -- --unit-status assumed-for-research --model-version "<tên bản>"
   ```

   `--unit-status` nhận `confirmed` hoặc `assumed-for-research`. Kết quả ghi vào `.local/ai`.

Quy trình gốc: [ai/CALLISTO_1_README.md](ai/CALLISTO_1_README.md).

</details>

## Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách sửa |
|---|---|---|
| `npm ci` cảnh báo `EBADENGINE` | Node khác bản 22 | Cài Node 22 (bảng Cài đặt công cụ), mở lại terminal |
| `'node'` hoặc `'uv'` is not recognized; `Cannot start uv` | Chưa cài, hoặc terminal mở trước khi cài | Cài theo bảng Cài đặt công cụ, mở terminal mới |
| `AI environment is missing. Run npm run ai:setup first (requires uv).` | Chưa có `ai/.venv` | `npm run ai:setup` |
| `Invalid environment: SESSION_SECRET` | Trống hoặc dưới 32 ký tự | Sinh lại bằng lệnh `node -e` ở mục Cấu hình |
| `Invalid environment: MONGODB_URI` | Trống hoặc sai tiền tố | Dùng `mongodb://…` hoặc `mongodb+srv://…` |
| `AI_SERVICE_URL must be an HTTP URL` | `AI_MODE=http` nhưng URL sai | `AI_SERVICE_URL=http://127.0.0.1:8000/predict` |
| `dev:wqi requires the isolated akh_wqi_local database.` | `MONGODB_URI` không trỏ `akh_wqi_local` local | Dùng URI mẫu, hoặc chạy `ai:dev` + `dev` ở hai terminal |
| Không tìm thấy `@wqi/contracts` hoặc `dist/index.js` | Chưa build contracts | `npm run build -w @wqi/contracts` |
| Terminal đứng ở `Waiting for the API on 127.0.0.1:5000…` | API chưa lên: MongoDB tắt hoặc `.env` sai | Đọc dòng log có tiền tố `api`; kiểm tra `Get-Service MongoDB` |
| `Port 5173 is already in use` | Còn một Vite khác đang chạy | Tắt terminal cũ hoặc tiến trình `node` đang giữ cổng |
| Trang dự đoán báo AI chưa sẵn sàng; http://127.0.0.1:8000/health trả 503 | Chưa nhập model, model không khớp manifest, hoặc `AI_MODE=disabled` | `npm run ai:import -- --source …`; kiểm tra `AI_MODE` (`db:local` đặt nó thành `disabled`) |
| Dự đoán lỗi 502 hoặc 504 | AI không chạy hoặc trả lời quá chậm | Chạy `dev:wqi` hoặc `ai:dev`; tăng `AI_TIMEOUT_MS` |
| Đăng nhập báo bị từ chối (403) | Mở web bằng địa chỉ không có trong `CLIENT_ORIGIN` | Mở http://localhost:5173 hoặc thêm địa chỉ vào `CLIENT_ORIGIN` |
| Bản đồ dùng nền Esri thay vì Goong | Khoá Goong trống, sai, hoặc bị giới hạn tên miền | Sửa `VITE_GOONG_MAPTILES_KEY`, chạy lại Vite |
| Khoảng 12 test bản đồ lỗi | Chạy Vitest trong `client/` | Chạy `npm test` ở thư mục gốc |
| E2E hoặc test real-service bị `skipped` | Thiếu tài khoản E2E, model hoặc Chromium | Xem bảng ở mục Kiểm thử |
| Bản chạy thật tải rất lâu ở lần đầu | Render gói free đang ngủ | Chờ khoảng 1 phút rồi tải lại |
| Build app Android lỗi đường dẫn quá dài | Windows giới hạn 260 ký tự | Đặt repo ở đường dẫn ngắn; xem [mobile/README.md](mobile/README.md) |

<details>
<summary>Lỗi DNS <code>querySrv ENODATA</code> khi dùng Atlas</summary>

DNS của máy không trả được bản ghi SRV của Atlas. Khi đó, và chỉ với tên miền Atlas công khai, API thử phân giải qua DNS-over-HTTPS của Google. API không gửi URI, tài khoản hay mật khẩu tới dịch vụ DNS, không đổi DNS của hệ điều hành, không tắt kiểm tra TLS. Session store dùng chung kết nối MongoDB đã mở, nên đăng nhập không gặp lại lỗi SRV. MongoDB local không dùng cơ chế này.

Đặt `MONGODB_DNS_FALLBACK=none` để tắt. Dùng `npm run db:status` để thử kết nối; lệnh không tạo tài khoản hay dữ liệu trạm. Vẫn lỗi thì đổi DNS mạng đang dùng hoặc thử mạng khác.

</details>

## Quy ước khi phát triển tiếp

- **Build `packages/contracts` trước** mọi lệnh khác (`npm run build -w @wqi/contracts`). Các script `dev`, `test`, `typecheck` đã tự làm việc này.
- **Không thêm `mobile/` vào workspaces gốc.** App có lockfile riêng; Vercel và Render chạy `npm ci` ở gốc và không được cài app.
- **CSP phải giống nhau ở 3 nơi:** `vercel.json`, `client/public/vercel.json` và cấu hình helmet trong `server/src/app.ts`. Thêm tên miền bản đồ hay font mới thì sửa cả ba.
- **Giữ kiểu xuống dòng CRLF.** Repo dùng `core.autocrlf=true`: Git lưu LF, máy Windows lấy ra CRLF. Không định dạng lại hàng loạt; tránh `sed -i` trong Git Bash vì nó làm mất ký tự CR.
- **Không commit `.env`, khoá API, mật khẩu hay file model** (`.cbm`, `.cbm.b64`). Dữ liệu doanh nghiệp (`.xlsx` trong `docs/`) cũng bị Git bỏ qua.
- **Chữ trên giao diện dùng khoá i18n**: `msg('key')`, thêm cặp English/Tiếng Việt vào `client/src/i18n/catalog.ts`. Quy tắc: [docs/i18n.md](docs/i18n.md).
- **Trước khi mở pull request** chạy đủ `npm run typecheck`, `npm run lint`, `npm test` (và `npm run ai:test` nếu sửa `ai/`). Pull request vào `main`, vì push `main` là deploy.

## Tài liệu liên quan

| Tài liệu | Nội dung |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Kiến trúc, module backend, phân quyền |
| [docs/ai-contract.md](docs/ai-contract.md) | Contract AI, tiền xử lý v1, lỗi, tính theo đợt |
| [docs/data-dictionary.md](docs/data-dictionary.md) | Từ điển dữ liệu |
| [docs/database-erd.md](docs/database-erd.md) | Sơ đồ quan hệ collection |
| [docs/openapi.yaml](docs/openapi.yaml) | Đặc tả API |
| [docs/i18n.md](docs/i18n.md) | Song ngữ Việt–Anh và kiểm thử |
| [docs/map-setup.md](docs/map-setup.md) | Bản đồ Goong + Leaflet, công tắc khu vực |
| [docs/mongodb-atlas-deployment.md](docs/mongodb-atlas-deployment.md) | Triển khai với MongoDB Atlas |
| [docs/feature-guides.md](docs/feature-guides.md) | Hướng dẫn trong ứng dụng cho biểu đồ và Excel |
| [docs/wqi-calculation-guide.md](docs/wqi-calculation-guide.md) | Hướng dẫn trang Dự đoán WQI |
| [ai/README.md](ai/README.md), [ai/MODEL_CARD.md](ai/MODEL_CARD.md) | Dịch vụ AI và hồ sơ model callisto 2.0 |
| [ai/CALLISTO_1_MODEL_CARD.md](ai/CALLISTO_1_MODEL_CARD.md) | Hồ sơ model lịch sử Callisto 1.0 (không còn serving) |
| [mobile/README.md](mobile/README.md) | App Android |

## Nhóm thực hiện

| Vai trò | Họ tên | GitHub |
|---|---|---|
| Thành viên | `[cần bổ sung]` | `[cần bổ sung]` |
| Thành viên | `[cần bổ sung]` | `[cần bổ sung]` |
| Thành viên | `[cần bổ sung]` | `[cần bổ sung]` |
| Giảng viên hướng dẫn | `[cần bổ sung]` | — |

## Giấy phép

Repo chưa có file `LICENSE`, nên mặc định chưa ai được phép dùng lại mã nguồn ngoài nhóm. Giấy phép: `[cần bổ sung]`.
