# Project Context

## 1. About This Project

**Hệ thống giám sát và tính toán WQI khu vực An Kim Hải** là web app quản lý trạm quan trắc, dữ liệu chất lượng nước lịch sử từ Excel, kiểm định dữ liệu, bản đồ GIS và cổng tích hợp AI Service để dự đoán WQI.

Khi làm việc trong dự án, ưu tiên theo thứ tự:

1. Tính đúng đắn và nguồn gốc dữ liệu.
2. Mã dễ đọc, dễ kiểm thử và phù hợp đồ án 10 tuần.
3. Hoàn thiện web trước; mobile chỉ thực hiện khi web hoàn thiện hoặc có yêu cầu rõ ràng.
4. Giải pháp đơn giản, đủ dùng; tránh abstraction và dependency chưa cần thiết.

Không có dữ liệu thì hiển thị trạng thái trống. Không tạo dữ liệu giả để làm đầy giao diện hoặc làm demo.

## 2. Commands

Chạy từ thư mục gốc repository bằng PowerShell.

```powershell
# Cài dependency theo lockfile
npm ci

# Chạy client, server và shared contracts ở development mode
npm run dev

# Kiểm tra TypeScript toàn monorepo
npm run typecheck

# Kiểm tra quy ước code
npm run lint

# Chạy unit và API integration tests
npm test

# Chạy browser end-to-end tests
npm run test:e2e

# Tạo production build
npm run build

# Phục vụ client build và API tại http://localhost:5000
npm start

# Tạo MongoDB indexes, không xóa dữ liệu
npm run db:indexes

# Tạo tài khoản Admin đầu tiên qua prompt, không có mật khẩu mặc định
npm run admin:create
```

Thiết lập local lần đầu:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Phải điền `SESSION_SECRET` ngẫu nhiên dài ít nhất 32 ký tự và đảm bảo MongoDB đang chạy trước khi khởi động server. Không ghi đè file `.env` đã tồn tại.

## 3. Architecture and Directory Structure

Repository là npm workspaces monorepo, TypeScript strict toàn bộ.

```text
WDP301_Project/
├── client/                  React 19 + Vite + Tailwind CSS
│   └── src/
│       ├── app/             Router và cấu hình cấp ứng dụng
│       ├── components/      UI dùng chung, bản đồ và biểu đồ
│       ├── features/        Feature theo miền nghiệp vụ
│       ├── layouts/         Main layout và navigation
│       └── lib/             Axios instance và shared hooks
├── server/                  Node.js 22 + Express 5 + Mongoose
│   ├── src/
│   │   ├── config/          Env và kết nối MongoDB
│   │   ├── integrations/    Adapter gọi AI Service
│   │   ├── middleware/      Auth, CSRF, validation và errors
│   │   ├── modules/         Auth, users, stations, records,
│   │   │                    imports, predictions và reports
│   │   └── scripts/         Tạo Admin và database indexes
│   └── tests/               API/integration tests
├── packages/contracts/      Zod schemas và API types dùng chung
├── e2e/                     Playwright tests với MongoDB tạm
└── docs/                    Tài liệu kiến trúc, dữ liệu và API
```

Luồng backend cốt lõi:

```text
Route → Validation/Authorization → Controller → Service → Mongoose Model
```

Không tạo Repository layer chỉ để bọc lại một lệnh Mongoose. Business logic nhiều bước đặt trong Service; Controller xử lý HTTP; Model chịu trách nhiệm schema/index.

Luồng dữ liệu Excel:

```text
Excel thật
  → Admin preview
  → ImportBatch + ImportedRow giữ nguyên dữ liệu nguồn
  → Admin bổ sung metadata từ nguồn thực
  → tạo WaterRecord pending
  → Admin verified hoặc rejected
  → chỉ verified mới xuất hiện công khai
```

Luồng AI:

```text
User nhập 6 thông số
  → Express kiểm tra dữ liệu và quyền
  → AI HTTP adapter
  → AI Service thật
  → kiểm tra response
  → lưu Prediction thuộc User
```

`Prediction` là lịch sử cá nhân, không phải dữ liệu quan trắc và không tự tạo `WaterRecord`.

## 4. Code Conventions

### Chung

- Tên biến, hàm, type, class, file và code comments dùng tiếng Anh.
- Nội dung giao diện và hướng dẫn người dùng dùng tiếng Việt.
- TypeScript phải giữ `strict`; tránh `any` và type assertion khi có thể mô hình hóa đúng kiểu.
- Dùng ES modules; import nội bộ backend có đuôi `.js` để tương thích NodeNext.
- Tái sử dụng schemas/types từ `@wqi/contracts`; không định nghĩa lại API shape trong nhiều nơi.
- Ưu tiên hàm ngắn, tên thể hiện ý nghĩa nghiệp vụ và early return.
- Không thêm abstraction, factory, interface hoặc dependency chỉ vì có thể cần sau này.

### Backend

- Route khai báo endpoint và middleware; không chứa business logic dài.
- Validate input bằng Zod ở trust boundary và Mongoose/index ở database boundary.
- Chỉ nhận trường đã whitelist; không truyền trực tiếp `req.body`/`req.query` thành MongoDB filter hoặc update.
- Response thành công dùng `{ data, meta? }`.
- Response lỗi dùng `{ error: { code, message, details?, requestId } }`.
- Dùng `AppError` cho lỗi nghiệp vụ dự kiến; không trả stack trace hoặc lỗi database thô.
- Endpoint ghi dữ liệu phải kiểm tra authentication, authorization, CSRF và Origin.
- Cập nhật `WaterRecord` phải gửi `version`; version cũ trả `409`.
- Thời gian lưu UTC, UI nhập/hiển thị theo `Asia/Ho_Chi_Minh`.

### Frontend

- Chia component theo feature; shared component chỉ đặt trong `components/` khi có nhiều feature sử dụng.
- Dùng Axios instance tại `client/src/lib/axios.ts`; không tạo HTTP client riêng trong feature.
- Dùng `useApi` hoặc shared hook phù hợp; hủy request cũ khi dependency/filter thay đổi.
- Mọi màn hình dữ liệu phải có loading, empty và error states.
- Không chuyển `null` hoặc missing thành `0`.
- Biểu đồ phải tách theo trạm và ghi rõ nếu chỉ hiển thị dữ liệu của trang hiện tại.
- Form phải có label, keyboard focus và thông báo lỗi có thể đọc được.
- Web cần responsive; không thêm mã mobile app vào `client/`.

### Naming

- React component/type/class: `PascalCase`.
- Biến/hàm/hook: `camelCase`; hook bắt đầu bằng `use`.
- Constant chia sẻ thực sự bất biến: `UPPER_SNAKE_CASE`; constant cục bộ vẫn dùng `camelCase`.
- File component React: `PascalCase.tsx`.
- File backend/helper: `kebab-case.ts` hoặc hậu tố vai trò như `.routes.ts`, `.service.ts`, `.model.ts`, `.controller.ts`.
- Test đặt cạnh frontend source hoặc trong `server/tests`; hậu tố `.test.ts(x)`/`.spec.ts`.

## 5. Workflow

### Trước khi sửa

1. Đọc `context.md` và tài liệu được tham chiếu ở cuối file.
2. Dùng `rg` để tìm entrypoint, caller và schemas liên quan.
3. Trace luồng từ UI/API đến Service/Model trước khi thay đổi.
4. Kiểm tra working tree; không ghi đè thay đổi của thành viên khác.

### Branch và commit

Repository hiện chưa có convention được nhóm xác nhận chính thức. Cho tới khi nhóm quy định khác, dùng:

- `feature/<short-kebab-name>` cho chức năng;
- `fix/<short-kebab-name>` cho sửa lỗi;
- `docs/<short-kebab-name>` cho tài liệu;
- `refactor/<short-kebab-name>` cho refactor không đổi hành vi.

Không tự push, merge hoặc sửa trực tiếp remote branch nếu người dùng chưa yêu cầu. Commit nên nhỏ, có một mục đích và message dạng imperative, ví dụ `Add Excel import preview validation`.

### Review và kiểm thử

- Thay đổi nhỏ: chạy test/typecheck liên quan.
- Thay đổi ảnh hưởng shared contracts hoặc nhiều workspace: chạy `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Thay đổi auth, import, router hoặc luồng chính: chạy thêm `npm run test:e2e`.
- Test dùng MongoDB tạm/riêng; không xóa, seed hoặc sửa database development.
- Fixture trong test được phép vì không trở thành dữ liệu ứng dụng.
- PR phải giải thích vấn đề, hành vi sau thay đổi, cách kiểm thử và giới hạn còn lại.

### Deploy

- Hiện tại ưu tiên chạy local và hoàn thiện web.
- Chỉ deploy khi người dùng yêu cầu hoặc web đã được nghiệm thu.
- Trước deploy phải chạy đủ checks, dùng HTTPS, MongoDB có xác thực, secret riêng và cấu hình `TRUST_PROXY` đúng hạ tầng.
- Không deploy mobile, tạo app store package hoặc chọn cloud provider nếu chưa có quyết định của nhóm.

## 6. Constraints and Things to Avoid

### Phải hỏi hoặc xác nhận trước khi làm

- Thay đổi stack, kiến trúc phân tầng hoặc cấu trúc monorepo.
- Thêm dependency lớn hoặc thay framework/library cốt lõi.
- Thay đổi public API theo hướng breaking.
- Migration có thể làm mất, ghi đè hoặc diễn giải lại dữ liệu hiện có.
- Thay đổi sáu thông số đầu vào, đơn vị hoặc cách biểu diễn `NH4+`.
- Thêm công thức WQI, bảng phân hạng hoặc preprocessing AI.
- Tự động ánh xạ dữ liệu Excel thiếu metadata vào trạm/thời gian.
- Triển khai cloud, mobile, IoT hoặc realtime ingestion.
- Xóa cứng Station, WaterRecord, ImportBatch hoặc dữ liệu nguồn.

### Không được làm

- Không tạo mock/seed data nghiệp vụ để lấp dashboard, map, chart hoặc demo.
- Không tự coi `Amoni` trong Excel là `NH4+`.
- Không suy ra thời gian từ tên file hoặc số thứ tự dòng.
- Không tự gán 756 dòng Excel vào một trạm.
- Không tự sửa giá trị nguồn bất thường; giữ nguyên và báo cảnh báo.
- Không trả WQI mock khi AI chưa cấu hình hoặc gặp lỗi.
- Không commit `.env`, credentials, API key, MongoDB URI hoặc dữ liệu người dùng.
- Không log secret hoặc đưa secret vào response frontend.
- Không bypass authentication/authorization vì frontend đã ẩn nút.
- Không sửa test để che lỗi sản phẩm hoặc sửa dữ liệu nguồn để test pass.
- Không viết mobile trước khi web hoàn thiện hoặc người dùng yêu cầu.

### Trạng thái dữ liệu hiện tại

- File nguồn có 756 dòng và 8 cột: `PH`, `Temp`, `BOD5`, `COD`, `DO`, `Amoni`, `Phosphat`, `Coliforms`.
- File thiếu trạm, tọa độ, thời gian, TSS và WQI.
- Chưa có xác nhận chính thức về đơn vị/cách biểu diễn `Amoni`.
- Chưa có model hoặc endpoint AI thật.
- Vì vậy chưa thể nghiệm thu dữ liệu quan trắc đầy đủ hoặc độ chính xác WQI.

## 7. References

Đọc file phù hợp thay vì mở rộng `context.md` bằng chi tiết dễ lỗi thời:

- Tổng quan và chạy local: `@README.md`
- Kiến trúc và ranh giới hệ thống: `@docs/architecture.md`
- Ý nghĩa trường và quy tắc dữ liệu: `@docs/data-dictionary.md`
- Hợp đồng tích hợp AI: `@docs/ai-contract.md`
- REST API: `@docs/openapi.yaml`
- Shared schemas và API types đang chạy: `@packages/contracts/src/index.ts`
- Backend composition root: `@server/src/app.ts`
- Frontend routes và quyền trang: `@client/src/app/router.tsx`
- Các lệnh chính xác: `@package.json`

Khi tài liệu và mã không khớp, kiểm tra test và luồng thực tế, xác định nguồn sai, rồi cập nhật mã và tài liệu trong cùng thay đổi.
