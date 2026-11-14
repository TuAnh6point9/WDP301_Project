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

Các giá trị phải là số hữu hạn, không âm; pH 0–14. Không ép chuỗi/rỗng/boolean thành số, không cho phép trường thừa. Thứ tự thuộc tính JSON không điều khiển thứ tự native. Khóa nh4/po4 không chứng minh đơn vị theo N/P. Không biến đổi hoặc điền thiếu (xem Tiền xử lý v1).

## Tiền xử lý v1 (chốt 05/11/2026)

Theo tài liệu yêu cầu: Kiểm tra dữ liệu → Backend/AI API → AI Service → Tiền xử lý → AI Model → WQI → Phân loại WQI. Tiền xử lý gồm làm sạch, tích hợp và rút gọn dữ liệu; **không biến đổi** dữ liệu.

| Bước | Nơi làm | Quy tắc |
|---|---|---|
| L1 Đọc số | backend, client (`parseDecimal`) | Dấu "," đọc là "." (quyết định 24). |
| L2 Dưới ngưỡng phát hiện | backend, client | `<x` tính bằng x, như sổ tay CCME WQI (2017). Ô Excel giữ nguyên chữ `<x`; hộp Duyệt ghi "Dưới ngưỡng phát hiện". Chữ `KPH` hoặc "không phát hiện" không có số thì báo lỗi `NOT_DETECTED`, yêu cầu ghi `<ngưỡng`. |
| L3 Thiếu số | backend | Không điền thiếu. Model coi NaN như 0 (thiếu COD cho 82 điểm thay vì 69), nên ô trống là lỗi. |
| L4 Giới hạn cứng | backend, AI | Số hữu hạn ≥ 0; pH 0–14. |
| L5 Nghi gõ nhầm (đỏ) | client (`inputFlag`) | DO > 15,45 (200% bão hòa ở 28 °C); Amoni > 121, Phosphat > 22,05, COD > 948 (gấp 10 lần mốc chia cao nhất của model). Không áp cho Coliform: ô nhiễm thật có thể lên hàng triệu. Chỉ nhắc, không chặn. |
| L6 AI chưa tính chuẩn (cam) | client (`inputFlag`) | pH < 5,55 (mốc chia thấp nhất của model) hoặc pH > 8,5 (hết dải 100 điểm của QĐ 1460). Chỉ nhắc, không chặn. |
| L7 Duyệt | admin | Mỗi dòng nhập Excel chờ admin duyệt: QĐ 1460 mục 2.1a yêu cầu "loại bỏ các giá trị sai lệch"; Thông tư 10/2021 Điều 25 yêu cầu kiểm tra tính hợp lý. |
| T1 Đơn vị cố định | AI (`preprocess`) | Theo bảng đặc tả dưới đây; không quy đổi. |
| T2 Rút gọn | AI | Chỉ 6 biến Top6. Temp và BOD5 được lưu nhưng không đưa vào model. |
| T3 Đổi tên, sắp thứ tự | AI | `coliform, nh4, ph, po4, do, cod` → `Coliforms, Amoni, PH, Phosphat, DO, COD`. |
| Biến đổi | — | Không log, không chuẩn hóa, không đổi DO sang DO%, không cắt (clip), không làm tròn, không điền thiếu. Lý do: 166/177 mốc chia của model là trung điểm giữa hai giá trị thô liền kề trong AKH-5_2026, nên model học trên số thô. Cắt hoặc làm tròn còn làm đổi kết quả (COD 500 cho 55,45; cắt về 94,8 cho 56,29). |
| Hậu xử lý | AI | Đầu ra ngoài 0–100 → `AI_OUTPUT_OUT_OF_RANGE`; làm tròn half-up rồi phân hạng. |

Ngưỡng cờ được đo trên artifact `cbc6efa7…`. `FLAG_MODEL_SHA256` trong contracts và test `flags.test.ts` khóa vào checksum này: đổi model thì phải đo lại các ngưỡng. Trên 756 dòng AKH, cờ bắt 3 dòng nghi gõ nhầm và 12 dòng pH, tổng 15 dòng (nếu gắn cờ mọi giá trị ngoài mốc chia thì sẽ là 257). `inputDomain` vẫn null.

### Đặc tả 6 biến đầu vào

| Biến | Trường API | Cột Excel và tên trong model | Đơn vị | Kiểu | Khoảng hợp lệ | Cờ (chỉ nhắc) |
|---|---|---|---|---|---|---|
| Coliform | `coliform` | Coliforms | MPN/100 mL (CFU coi như MPN) | số | ≥ 0 | không có |
| Amoni | `nh4` | Amoni | mg/L theo N | số | ≥ 0 | đỏ khi > 121 |
| pH | `ph` | PH | không đơn vị | số | 0–14 | cam khi < 5,55 hoặc > 8,5 |
| Phosphat | `po4` | Phosphat | mg/L theo P | số | ≥ 0 | đỏ khi > 22,05 |
| DO | `do` | DO | mg/L | số | ≥ 0 | đỏ khi > 15,45 |
| COD | `cod` | COD | mg/L | số | ≥ 0 | đỏ khi > 948 |

Mọi biến đều đọc `<x` là x và báo lỗi khi gặp `KPH`.

## Đơn vị và helper text tham chiếu 1460

Form hiển thị đơn vị: DO, COD, Amoni và Phosphat đều ghi mg/L (nhóm chốt 14/11 bỏ chữ "theo N/P" khỏi giao diện; Amoni vẫn hiểu là N-NH4, Phosphat là P-PO4 như bảng trên, và biểu đồ không vẽ chúng chung trục giá trị thật với DO/COD); Coliform MPN/100 mL; pH không đơn vị. Đây là `referenceUnit` phục vụ hướng dẫn, không thay `unitBasis=training-source-unverified` hoặc xác nhận đơn vị artifact. Helper giải thích pH 0–14 là validation ứng dụng, các nồng độ ≥0 không có cap trên được xác minh; mốc chấm điểm WQI không phải giới hạn nhập. Không đổi DO sang DO%, không nhầm Phosphat với TP, không quy đổi CFU/MPN. Tham khảo [Quyết định 1460/QĐ-TCMT](https://quantracmoitruong.gov.vn/storage/news_file_attach/QD%201460%20TCMT%20ngay%2012.11.2019%20WQI.pdf).

## Response và lưu trữ

AI trả `wqi` nguyên 0–100, `rawWqi` số hữu hạn 0–100, `qualityClass`, `modelVersion`, `algorithm=CatBoost`, `predictionSchemaVersion=catboost-top6-amoni-v1`, `artifactSha256`, `referenceBasis=lecturer-provided`, `unitStatus=unverified`.

Giữ điểm thô, làm tròn half-up rồi phân dải 91/76/51/26/10 để hiển thị. Không lưu hoặc trả `classificationVersion` (quyết định 17/10/2026); bản ghi cũ còn trường này được lọc khỏi API. WQI theo kỹ thuật tính toán chỉ nằm trong 0–100 (quyết định 17/10/2026): đầu ra model ngoài 0–100 bị báo lỗi `AI_OUTPUT_OUT_OF_RANGE` và loại bỏ, không clipping, không lưu (API trả 422; dòng Excel ghi lỗi). NaN/vô cực trả `AI_INFERENCE_ERROR`. Gateway kiểm tra raw/rounded/class phù hợp trước khi lưu. Model/version/checksum/schema và userId từ session được lưu cùng snapshot. Inference lỗi không ghi document và không tạo WaterRecord.

`GET /health` AI trả 200 khi CBM và manifest hợp lệ, ngược lại 503. Có featureOrder, algorithm, schema/checksum và metadata công khai; inputDomain null khi không có miền train được bàn giao. `GET /api/v1/predictions/status` trả envelope `{data}` với available/configured/reason và metadata readiness. Không dùng miền Callisto làm giới hạn CatBoost.

Backend lỗi schema 400; AI schema lỗi 422; miền được khai báo vi phạm 422; model chưa sẵn sàng 503; unreachable/malformed/inference upstream 502; timeout 504. Không retry POST/redirect/fallback. JSON upstream tối đa 16KB.

## Lịch sử và quan trắc

GET list/detail lọc owner, kể cả Admin. Đọc kết quả cũ nguyên trạng; thiếu phiên bản schema không khiến bản ghi cũ bị ẩn. BOD5 cũ không đổi thành COD. Từ 06/11/2026 giao diện và file tải về không hiện tên, thuật toán hay mã model (DB/API vẫn lưu `modelVersion`, `algorithm`, `artifactSha256` để kiểm `AI_MODEL_CHANGED`). Lịch sử và báo cáo tải file `.xlsx` do server dựng qua `GET /predictions/export?page&limit` (lọc owner, limit tối đa 100): lịch sử theo trang (`lich-su-tinh-wqi-trang-<n>.xlsx`), báo cáo 20 kết quả mới nhất (`20-lan-tinh-wqi-gan-nhat.xlsx`). Sheet `Lịch sử tính WQI` gồm `Thời gian tính` (giờ Việt Nam), tên thông số theo file mẫu (`Coliforms, Amoni, PH, Phosphat, DO, COD`, thêm `Temp/BOD5/TSS` nếu bản ghi cũ trên trang có), `WQI`, `Phân loại`; cột thiếu để trống.

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

Excel tính hàng loạt chỉ bắt buộc sáu cột `Coliforms, Amoni, PH, Phosphat, DO, COD`.
`Temp` và `BOD5` có thể thiếu cột hoặc giá trị; khi thiếu lưu null và xuất ô trống.
`Mã đợt`, `Mã trạm`, `Ghi chú` cũng tùy chọn, chỉ được giữ lại để ghi vào file kết quả.
Cột khác được bỏ qua; cột trùng tên bị từ chối để tránh ánh xạ mơ hồ.

File kết quả (từ 06/11/2026) chỉ có tiếng Việt, theo thứ tự cột của file mẫu nhập liệu:
sheet `Kết quả WQI` gồm `Mã đợt, Mã trạm, Coliforms, Amoni, PH, Phosphat, DO, COD, Temp,
BOD5, Ghi chú, WQI, Phân loại, Trạng thái, Lý do lỗi, Dòng Excel`; sheet `Thông tin` gồm mã lượt tính,
tên file, thời gian tạo (không ghi tên hay mã model). Ô số gõ dạng chữ (`5000`, `7,2`) được ghi thành số;
`<x`, `KPH` và công thức giữ nguyên chữ. Phân loại là nhãn tiếng Việt đã lưu; lý do lỗi dịch
sang tiếng Việt bằng `server/src/modules/prediction-batches/export-vi.ts` (test đối chiếu với
catalog của web). Tên file `ket-qua-wqi-<id>.xlsx`.
