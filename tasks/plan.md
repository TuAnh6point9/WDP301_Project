# Implementation Plan: Import Excel theo luật predict + làm rõ Data Records

## Overview
Đổi luật import Excel của Admin cho khớp luật của chức năng predict/calculate: file chỉ cần đủ 6 cột PH, COD, DO, Amoni, Phosphat, Coliforms (thứ tự tùy ý); Temp và BOD5 có thể thiếu, khi đó để trống. Đồng thời làm rõ trang Data Records: thêm xem chi tiết từng record và chốt việc record có WQI hay không.

## Hiện trạng đã kiểm (17/10/2026)
- Import Admin (`server/src/modules/imports/import.service.ts`, `parseWorkbook`):
  - Bắt buộc đủ 8 cột đúng thứ tự A→H; có cột thừa là từ chối cả file.
  - Có công thức là từ chối cả file.
  - Báo lỗi cả Temp và BOD5. `Book1.xlsx` của người dùng bị từ chối vì luật này.
- Predict batch (`server/src/modules/prediction-batches/workbook.ts`, `parsePredictionWorkbook`):
  - Tìm cột theo tên, không theo vị trí.
  - Bắt buộc 6 cột; Temp và BOD5 không bắt buộc (thiếu thì `null`). Trùng tên cột → từ chối file.
  - Cột lạ bị bỏ qua; dòng trống bị bỏ qua.
  - Ô công thức → dòng đó lỗi (không từ chối cả file); chỉ kiểm 6 cột bằng `predictionParametersSchema`.
  - Giới hạn: 5 MB, 10.000 dòng, 1 sheet.
- Data Records (`/admin/data`):
  - Hiện `WaterRecord` (dữ liệu quan trắc lịch sử), không phải prediction.
  - Chỉ có 1 record: dòng 2 của file thử, được normalize và verified ngày 17/10. 756 dòng thật chưa được normalize vì thiếu trạm và thời điểm đo.
  - `wqi`, `qualityClass`, `wqiSource` luôn `null` (normalize không gọi model).
  - Không có endpoint hay UI xem chi tiết; `GET /water-records/:id` chưa tồn tại.

## Architecture Decisions
- Import Admin dùng lại `parsePredictionWorkbook` thay vì viết parser thứ hai. Thêm `contentHash` và `issueCount` ở `import.service.ts`. Một nguồn luật cho cả hai chức năng.
- Raw vẫn bất biến. Cột thiếu được lưu `null`; ô công thức được lưu dạng text `=...` như predict.
- Chi tiết record: thêm `GET /water-records/:id` chỉ cho Admin, populate dòng raw gốc (`source.rowId` → values, rowNumber, batch fileName). UI dùng `Modal` có sẵn.
- Giao diện giữ token và class sẵn có của dự án (`card`, `table`, `status`, `badge`, `Modal`). `ui-ux-pro-max` chỉ dùng để rà khả năng dùng và độ dễ đọc, không đổi theme.

## Task List
Chi tiết từng task ở `tasks/todo.md`.

### Phase 1: Luật import giống predict
- [ ] Task 1: Server — import Admin chấp nhận file 6 cột theo tên (dùng chung parser predict)
- [ ] Task 2: UI Import — bảng cột bắt buộc/tùy chọn, preview hiện ô trống, luật hiển thị đúng

### Checkpoint 1
- [ ] Test, typecheck, build đạt; file 6 cột và 8 cột (đổi thứ tự) import được; thiếu COD bị từ chối

### Phase 2: Data Records rõ ràng
- [ ] Task 3: Xem chi tiết record (API `GET /water-records/:id` + modal Details)
- [ ] Task 4: [chờ Q1] WQI cho record
- [ ] Task 5: [chờ Q2] Normalize hàng loạt

### Checkpoint 2
- [ ] Admin mở được chi tiết của record verified và thấy đủ 6 thông số, raw 8 cột, nguồn, người duyệt

### Phase 3: Kiểm chứng
- [ ] Task 6: Chạy thật trên Atlas + regression predict batch

### Checkpoint: Complete
- [ ] Mọi tiêu chí đạt, người dùng duyệt

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Đổi parser làm vỡ predict batch | High | Không sửa `parsePredictionWorkbook`, chỉ gọi nó; chạy lại `prediction-workbook.test.ts` và `prediction-batches.test.ts` |
| Ô công thức đổi từ "từ chối file" sang "dòng lỗi" | Med | Ghi rõ trong luật UI; test riêng |
| Hash trùng: file khác thứ tự cột sẽ có hash khác | Low | Giữ hash theo cả file (quyết định (c) cũ), ghi chú |
| Thông báo `INVALID_WORKBOOK` trong catalog đang ghi "đúng tám cột" | Med | Đổi câu catalog sang câu của predict, test error-messages |
| Ghi dữ liệu thử lên Atlas dùng chung | Med | Dùng lại tài khoản và trạm thử, ghi ID |

## Open Questions
- **Q1. Record có cần WQI không?** FR-03 ghi "WQI nếu có". Phương án:
  - (a) Tính bằng CatBoost lúc duyệt `verified`, lưu `wqi`, `qualityClass`, `wqiSource` = model version.
  - (b) Tính lúc normalize.
  - (c) Để trống.
  - Đề xuất: (a), vì chỉ record đã duyệt mới công khai.
- **Q2. Normalize hàng loạt.** File không có trạm và thời điểm đo, nên 756 dòng phải normalize từng dòng. Phương án:
  - (a) Cho phép thêm 2 cột tùy chọn `Station` (mã trạm) và `MeasuredAt` vào Excel.
  - (b) Chọn nhiều dòng, dùng chung 1 trạm và 1 thời điểm.
  - (c) Giữ từng dòng.
  - Đề xuất: (a), vì không bịa metadata.
- **Q3.** Temp/BOD5 có mặt nhưng không phải số: chỉ lưu raw, không báo lỗi (giống predict). Đề xuất: đồng ý.
- **Q4.** Trang quản lý trạm vẫn là stub. Có mở lại phạm vi này không? Nếu không có trạm thì không normalize được qua UI.
