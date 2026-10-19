# Todo — Import theo luật predict + Data Records

## Task 1: Server — import Admin dùng luật cột của predict
**Description:** `parseWorkbook` trong `import.service.ts` gọi `parsePredictionWorkbook`, rồi tính `contentHash` (SHA-256 cả file) và `issueCount`. Bỏ kiểm tra "đúng 8 cột theo thứ tự".

**Acceptance criteria:**
- [ ] File chỉ có 6 cột (thứ tự bất kỳ) → preview 200, commit 201; raw `Temp`/`BOD5` = `null`.
- [ ] File thiếu một trong 6 cột, hoặc trùng tên cột → 400 `INVALID_WORKBOOK`, câu thông báo nêu 6 cột bắt buộc.
- [ ] Lỗi dòng chỉ cho 6 cột; Temp/BOD5 không số không tạo lỗi. Dòng trống bị bỏ qua. Ô công thức thì dòng đó lỗi.

**Verification:**
- [ ] `npx vitest run server/tests/admin.routes.test.ts server/tests/prediction-workbook.test.ts server/tests/prediction-batches.test.ts`
- [ ] `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `server/src/modules/imports/import.service.ts`, `packages/contracts/src/userMessages.ts`, `server/tests/admin.routes.test.ts`

**Estimated scope:** S

## Task 2: UI Import — cột bắt buộc/tùy chọn và luật đúng
**Description:** Panel "Required columns" tách 6 cột bắt buộc và 2 cột tùy chọn (Temp, BOD5), bỏ chữ "column A–H". "Validation rules" ghi đúng luật mới. Preview hiện ô trống là "empty". `usable()` chỉ cần xét `issues` (giờ chỉ thuộc 6 cột).

**Acceptance criteria:**
- [ ] Upload file 6 cột trên trình duyệt → preview hiện Temp/BOD5 trống, nút Import bật.
- [ ] Nội dung luật trên UI khớp từng luật ở Task 1.

**Verification:**
- [ ] `npm run typecheck -w @wqi/client`, `npm run build -w @wqi/client`
- [ ] Manual: Chromium 1440px, screenshot trang Import với file 6 cột

**Dependencies:** Task 1

**Files likely touched:** `client/src/features/imports/pages/AdminImportPage.tsx`

**Estimated scope:** S

## Checkpoint 1
- [ ] `npm test`, `npm run typecheck`, `npm run build` đạt
- [ ] Người dùng thử lại `Book1.xlsx`

## Task 3: Xem chi tiết record
**Description:** Thêm `GET /water-records/:id` (chỉ Admin), trả record đã populate: trạm, người tạo, người duyệt, dòng raw gốc (values 8 cột, rowNumber) và tên file batch. Trang Data Records thêm nút "Details" ở mọi dòng, mở `Modal` gồm: trạm, thời điểm đo, 6 thông số, unitBasis, WQI (hoặc "Chưa tính"), nguồn (file, dòng, raw), trạng thái, ghi chú duyệt, người/thời điểm duyệt.

**Acceptance criteria:**
- [ ] Admin 200, User 403, khách 401; id không tồn tại → 404.
- [ ] Modal hiện đúng số liệu của record `6ad2da8e…` trên Atlas, kể cả raw BOD5/Temp.

**Verification:**
- [ ] `npx vitest run server/tests/admin.routes.test.ts`
- [ ] Manual: mở Details trên trình duyệt, screenshot

**Dependencies:** None (độc lập Phase 1)

**Files likely touched:** `server/src/modules/water-records/water-record.routes.ts`, `water-record.controller.ts`, `water-record.service.ts`, `client/src/features/water-records/api.ts`, `pages/AdminDataPage.tsx`

**Estimated scope:** M

## Task 4: [chờ Q1] WQI cho record
**Description:** Theo quyết định Q1, khi duyệt `verified` thì gọi `predictWqi` (CatBoost) với 6 thông số và lưu `wqi`, `qualityClass`, `wqiSource` = modelVersion. AI không phản hồi → 503, không đổi trạng thái record. Cột WQI hiện trên Data Records.

**Acceptance criteria:**
- [ ] Verify khi AI chạy → record có `wqi` khớp `/predict` cùng 6 số.
- [ ] Verify khi AI tắt → 503 `AI_UNAVAILABLE`, record vẫn `pending`.

**Verification:** `npx vitest run server/tests/admin.routes.test.ts`; manual: verify một record

**Dependencies:** Task 3, Q1

**Files likely touched:** `water-record.service.ts`, `admin.routes.test.ts`, `AdminDataPage.tsx`

**Estimated scope:** M

## Task 5: [chờ Q2] Normalize hàng loạt
**Description:** Theo Q2: nếu chọn cột tùy chọn `Station` và `MeasuredAt` trong Excel, commit tự tạo record pending cho các dòng hợp lệ có đủ metadata. Dòng thiếu metadata giữ cách normalize từng dòng.

**Acceptance criteria:** [cần bổ sung sau khi chốt Q2]

**Dependencies:** Task 1, Q2

**Estimated scope:** M

## Task 6: Kiểm chứng thật
**Description:** Chạy `npm run ai:dev` + `npm run dev` (Atlas), dùng tài khoản `admin-test@akh.local`.

**Acceptance criteria:**
- [ ] Import file 6 cột và file 8 cột đổi thứ tự thành công.
- [ ] Thiếu 1 cột → thông báo đúng.
- [ ] Details hiện đủ thông tin; predict batch (`/calculate`) vẫn chạy với cùng file.
- [ ] Không lỗi JS.
- [ ] Dọn tiến trình node.

**Verification:** `npm run typecheck`, `npm run lint` (bỏ `.claude/worktrees`), `npm test`, `npm run build`; screenshot

**Dependencies:** Task 1–3 (và 4–5 nếu đã chốt)

## Checkpoint: Complete
- [ ] Mọi tiêu chí đạt, người dùng duyệt
