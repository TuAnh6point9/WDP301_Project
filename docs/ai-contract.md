# Contract AI — CatBoost Tuned / callisto 2.0

Quyết định 12/10/2026: dùng đúng sáu biến trong artifact được giảng viên xác nhận. Prediction mới không nhận BOD5, Temp hoặc TSS. Lịch sử dùng snapshot riêng, không áp schema đầu vào hiện tại lên kết quả cũ.

## Request và mapping

`POST /api/v1/predictions` (session, Origin/CSRF, 10 lần/phút) và AI `POST /predict`:

```json
{"parameters":{"coliform":5000,"nh4":0.2,"ph":7.2,"po4":0.3,"do":5.7,"cod":25},"unitBasis":"training-source-unverified"}
```

| Thứ tự native | API | Tên trong model |
|---:|---|---|
| 1 | coliform | Coliforms |
| 2 | nh4 | Amoni |
| 3 | ph | PH |
| 4 | po4 | Phosphat |
| 5 | do | DO |
| 6 | cod | COD |

Các giá trị phải là số hữu hạn, không âm; pH 0–14. Không ép chuỗi/rỗng/boolean thành số, không cho phép trường thừa. Thứ tự thuộc tính JSON không điều khiển thứ tự native. Khóa nh4/po4 không chứng minh đơn vị theo N/P. Không biến đổi hoặc điền thiếu.

## Đơn vị và helper text tham chiếu 1460

Form hiển thị đơn vị quy định của VN-WQI: DO/COD mg/L; N-NH4 mg/L as N; P-PO4 mg/L as P; Coliform MPN/100 mL; pH không đơn vị. Đây là `referenceUnit` phục vụ hướng dẫn, không thay `unitBasis=training-source-unverified` hoặc xác nhận đơn vị artifact. Helper giải thích pH 0–14 là validation ứng dụng, các nồng độ ≥0 không có cap trên được xác minh; mốc chấm điểm WQI không phải giới hạn nhập. Không đổi DO sang DO%, không nhầm Phosphat với TP, không quy đổi CFU/MPN. Tham khảo [Quyết định 1460/QĐ-TCMT](https://quantracmoitruong.gov.vn/storage/news_file_attach/QD%201460%20TCMT%20ngay%2012.11.2019%20WQI.pdf).

## Response và lưu trữ

AI trả `wqi` nguyên 0–100, `rawWqi` số hữu hạn 0–100, `qualityClass`, `modelVersion`, `algorithm=CatBoost`, `predictionSchemaVersion=catboost-top6-amoni-v1`, `artifactSha256`, `classificationVersion=VN_WQI_1460_2019`, `referenceBasis=lecturer-provided`, `unitStatus=unverified`.

Giữ điểm thô, làm tròn half-up rồi phân dải 91/76/51/26/10 để hiển thị. ClassificationVersion mô tả chính sách hiển thị, không chứng nhận nguồn nhãn huấn luyện. Không clipping. Gateway kiểm tra raw/rounded/class phù hợp trước khi lưu. Model/version/checksum/schema và userId từ session được lưu cùng snapshot. Inference lỗi không ghi document và không tạo WaterRecord.

`GET /health` AI trả 200 khi CBM và manifest hợp lệ, ngược lại 503. Có featureOrder, algorithm, schema/checksum và metadata công khai; inputDomain null khi không có miền train được bàn giao. `GET /api/v1/predictions/status` trả envelope `{data}` với available/configured/reason và metadata readiness. Không dùng miền Callisto làm giới hạn CatBoost.

Backend lỗi schema 400; AI schema lỗi 422; miền được khai báo vi phạm 422; model chưa sẵn sàng 503; unreachable/malformed/inference upstream 502; timeout 504. Không retry POST/redirect/fallback. JSON upstream tối đa 16KB.

## Lịch sử và quan trắc

GET list/detail lọc owner, kể cả Admin. Đọc kết quả cũ nguyên trạng; thiếu phiên bản schema không khiến bản ghi cũ bị ẩn. BOD5 cũ không đổi thành COD. Mã artifact cũ được hiển thị callisto 1.0 theo mapping cố định; CSV vẫn giữ Original Model Identifier. History CSV theo trang, report tối đa 20 kết quả mới nhất, cột thiếu để trống và giữ Unit Basis từng dòng.

ImportedRow vẫn giữ đúng `PH, Temp, BOD5, COD, DO, Amoni, Phosphat, Coliforms` cùng giá trị nguồn. WaterRecord và các adapter quan trắc/import còn legacy hoặc stub được ghi nhận riêng; không tự suy đoán trạm, thời gian hay TSS.

## Tính từ Excel theo đợt

API web `/prediction-batches` dành cho User/Admin đăng nhập, lọc owner ở mọi
thao tác. `POST /preview` nhận multipart `file`, tạo draft và các dòng nguồn;
chưa chạy inference. `POST /:id/start` xác nhận hoặc tiếp tục cùng đợt, trả 202;
gửi lặp không tạo đợt mới. GET list/detail/rows hỗ trợ lịch sử/phân trang;
`GET /:id/export` trả XLSX toàn bộ đợt sau khi hoàn tất. Header Origin và CSRF
bắt buộc cho POST như luồng tính đơn.

Worker dùng MongoDB lease, nhóm 100 dòng. AI nội bộ `POST /predict/batch` nhận
`{rows:[{rowNumber,parameters}],unitBasis,expectedArtifactSha256,expectedModelVersion}`.
Response `{rows:[{rowNumber,result}|{rowNumber,error:{code}}]}` giữ đúng định danh
dòng, result dùng schema tính đơn. Tối đa 100 dòng/request, JSON response tối đa
128 KB; đường tính đơn vẫn giữ 16 KB. Sai raw score/domain được trả lỗi theo dòng;
mất dịch vụ hoặc response sai cấu trúc làm tạm dừng đợt. Artifact/version không
khớp trả `AI_MODEL_CHANGED`, không lưu kết quả khác model vào cùng đợt.

Snapshot và tám cột nguồn nằm ở PredictionBatch/PredictionBatchRow, không tạo
Prediction riêng lẻ hoặc WaterRecord. Trạng thái: preview → queued → running →
completed/completed_with_errors; gián đoạn chuyển paused và start để tiếp tục.
Unique index bảo vệ một đợt active/owner và một kết quả/batchId/rowNumber.

Excel tính hàng loạt chỉ bắt buộc sáu cột `PH, COD, DO, Amoni, Phosphat, Coliforms`.
`Temp` và `BOD5` có thể thiếu cột hoặc giá trị; khi thiếu lưu null và xuất ô trống.
Cột khác được bỏ qua; cột chỉ số trùng tên bị từ chối để tránh ánh xạ mơ hồ.
