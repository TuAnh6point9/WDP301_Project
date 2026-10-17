# Hệ thống WQI An Kim Hải

Website React/TypeScript, API Express/MongoDB và AI service FastAPI/CatBoost. Model hiện tại là **callisto 2.0**, dùng sáu chỉ số Coliforms, Amoni, PH, Phosphat, DO và COD.

## Chạy local

Bản đồ dùng **MapLibre** ở trang chủ, `/map` và quản trị trạm, không cần Google Maps key/Map ID/billing. Có nền đường phố và vệ tinh Esri. Công tắc **An Kim Hai area** bật/tắt đường biên, nền tối ngoài vùng và nhãn sông; lựa chọn được dùng chung và ghi nhớ trên trình duyệt. Xem [cấu hình và điều kiện sử dụng nguồn bản đồ](docs/map-setup.md). Khi bản đồ lỗi, danh sách trạm và form tọa độ vẫn dùng được.

Yêu cầu Node 22, npm 10+, Python 3.12 qua [uv](https://docs.astral.sh/uv/) và MongoDB đang chạy. Chạy các lệnh bên dưới từ thư mục gốc repository.

```powershell
npm ci
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Chỉ sao chép `.env.example` khi chưa có `.env`. Điền chuỗi ngẫu nhiên vừa tạo vào `SESSION_SECRET` trong `server/.env`, kiểm tra `MONGODB_URI` và `CLIENT_ORIGIN`. Lệnh `dev:wqi` dùng database phát triển riêng `akh_wqi_local` tại `127.0.0.1:27017`, khớp cấu hình mẫu. MongoDB sẽ tạo database khi ứng dụng ghi dữ liệu lần đầu.

Model native `.cbm` được bàn giao riêng, không nằm trong repository. Thay đường dẫn minh họa bằng file model phù hợp với `ai/catboost.manifest.json`:

```powershell
npm run ai:setup
npm run ai:import -- --source "<duong-dan-model.cbm>"
npm run build -w @wqi/contracts
npm run db:indexes
npm run admin:create
npm run dev:wqi
```

Nếu `.local/ai/catboost/model.cbm` và `manifest.json` đã có, bỏ bước import. Tạo tài khoản admin một lần bằng lệnh tương tác `admin:create`; không chạy lại cho tài khoản đã tồn tại. Repository không kèm dữ liệu quan trắc, tài khoản hay mật khẩu.

Mở **http://localhost:5173** hoặc **http://127.0.0.1:5173**; AI cổng 8000, API cổng 5000. `npm run dev` chỉ chạy web/API; `dev:wqi` chạy đủ web/API/AI và bật HTTP AI cho tiến trình phát triển. Khi model chưa được cung cấp, trang web/API vẫn khởi động nhưng chức năng dự đoán chưa sẵn sàng.

Với MongoDB khác cấu hình phát triển ở trên, đặt `MONGODB_URI`, `AI_MODE=http` và `AI_SERVICE_URL=http://127.0.0.1:8000/predict` trong `server/.env`, chạy `npm run ai:dev` và `npm run dev` ở hai terminal.

## Dữ liệu và giới hạn

API nhận `ph, do, cod, nh4, po4, coliform`. `nh4` là khóa ánh xạ Amoni, `po4` ánh xạ Phosphat; hai tên khóa không chứng minh analyte theo N/P. Dùng giá trị nguồn, không đổi đơn vị. Metadata CatBoost ghi `unitStatus=unverified`, `referenceBasis=lecturer-provided`; đơn vị, external preprocessing, nguồn nhãn và độ chính xác độc lập chưa được xác minh. Điểm thô phải hữu hạn trong 0–100, làm tròn half-up rồi dùng sáu dải WQI hiện có để hiển thị; không cắt điểm về giới hạn.

Tám cột quan trắc gốc vẫn được giữ nguyên. Prediction cũ giữ BOD5, đơn vị, kết quả và mã model cũ; History/Result/CSV hiển thị theo snapshot. Callisto 1.0 được giữ offline, không dùng làm fallback.

## Tính WQI từ Excel

Ở trang **Calculate**, bấm nút **Excel** ở cuối khung nhập để mở hộp chọn file.
File được tự tải lên và mở bảng kiểm tra tại `/excel/:id`. Nhận file
`.xlsx` một sheet, tối đa 5 MB/10.000 dòng có dữ liệu. Hàng đầu cần đủ sáu tên
`PH, COD, DO, Amoni, Phosphat, Coliforms`, thứ tự có thể thay đổi.
Sáu chỉ số tính toán phải là ô số thật; ô chữ/công thức/thiếu được báo lỗi.
Temp/BOD5 không bắt buộc có cột hoặc giá trị; nếu thiếu sẽ để trống trong bảng
và file kết quả. Cột ngoài tám chỉ số được bỏ qua; tên cột chỉ số không được trùng.
Xem trước rồi xác nhận tính các dòng hợp lệ.

Mỗi lần tính được lưu riêng trong **Lịch sử → Tính từ Excel** (`/history/excel`).
Có thể rời trang khi đang chạy; mất kết nối AI thì mở lại và bấm **Tiếp tục**.
Một tài khoản có tối đa một đợt chờ/đang chạy. File kết quả gồm tất cả dòng,
WQI/phân loại/lý do lỗi và sheet metadata model; chỉ tải khi đợt hoàn tất.
User và Admin chỉ thấy các đợt của mình. Dữ liệu không được công bố lên bản đồ.

Khởi động lại cả API và AI nếu chúng đang dùng code cũ. API tự tạo index cho
hai collection batch mới; không cần Redis. Worker xử lý 100 dòng/lượt; khi
API bị dừng đột ngột, đợt đang chạy được nhận lại sau khi lease hết hạn
(tối đa khoảng 2 phút). Giới hạn model/đơn vị nguồn vẫn áp dụng như nhập tay.

Kiểm thử toàn luồng riêng: `node node_modules/vitest/vitest.mjs run server/tests/prediction-batch-real.test.ts`.
Test này dùng MongoDB tạm, CatBoost local và Chromium của Playwright; cần
artifact `.local/ai/catboost/model.cbm`/`manifest.json` và bản web đã build.
Kết quả đo và screenshot được lưu theo từng lượt tại `docs/local/audits/evidence/wqi-batch-verification/runs/`, chỉ trên máy chạy test.

## Kiểm tra

```powershell
npm run typecheck
npm run lint
npm test
npm run ai:test
npm run build
npm run test:e2e
```

E2E dùng tài khoản local thật và tạo một prediction mới. Mẫu kiểm tra tích hợp không phải bằng chứng độ chính xác model. Các module bản đồ, WaterRecord, import UI và quản trị còn stub vẫn là công việc riêng; tích hợp CatBoost không đồng nghĩa đã hoàn tất các module đó.

Trước lần chạy E2E đầu tiên, cài Chromium bằng `npx playwright install chromium`,
khởi động web/API/AI và đặt `E2E_EMAIL`, `E2E_PASSWORD` bằng tài khoản kiểm thử
của bạn trong biến môi trường. Khi không có tài khoản, bài E2E được bỏ qua.
Các kiểm thử real-service cũng cần Chromium, model riêng và `npm run build`;
chúng dùng database tạm riêng. Máy không có model riêng sẽ bỏ qua các bài đó.

## Cấu trúc repository

| Đường dẫn | Nội dung |
|---|---|
| `client/src/`, `client/public/` | Giao diện và tài nguyên đang sử dụng |
| `server/src/` | API, MongoDB, phân quyền, đọc Excel và xử lý nền |
| `packages/contracts/` | Schema và kiểu dữ liệu dùng chung |
| `ai/`, `scripts/` | AI serving, nhập model và lệnh phát triển |
| `server/tests/`, `ai/tests/`, `e2e/`, các file `*.test.*` | Kiểm thử tự động |
| `docs/` | Tài liệu kỹ thuật dùng chung |
| `docs/local/` | Tài liệu làm việc riêng, audit, ảnh, bản nháp và công cụ một lần; Git bỏ qua |

`.env`, `.local/`, `ai/.venv/`, `node_modules/`, các thư mục `dist/` và báo cáo kiểm thử cũng được Git bỏ qua. Model và dữ liệu phục vụ chạy máy giữ trong `.local/`; chúng không được gom vào tài liệu.

Tài liệu: [kiến trúc](docs/architecture.md), [AI contract](docs/ai-contract.md), [data dictionary](docs/data-dictionary.md), [OpenAPI](docs/openapi.yaml), [model card](ai/MODEL_CARD.md). Hồ sơ [Callisto 1.0](ai/CALLISTO_1_MODEL_CARD.md) mô tả model lịch sử, không phải model đang serving.
