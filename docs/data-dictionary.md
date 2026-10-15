# Từ điển dữ liệu

## Dữ liệu Excel nguồn

File `AKH-5_2026 (1).xlsx` có 756 dòng dữ liệu thực tại Sheet1 và tám cột: `PH`, `Temp`, `BOD5`, `COD`, `DO`, `Amoni`, `Phosphat`, `Coliforms`. Các giá trị và số dòng được giữ nguyên trong `ImportedRow`; không giữ trang trí Excel và không tự biến `Amoni` thành NH4+.

File thiếu mã trạm, tọa độ, thời gian đo, TSS và WQI. Những trường đó luôn để trống cho đến khi Admin bổ sung từ nguồn thực. Zero và giá trị trống là hai trạng thái khác nhau.

## Station

`code` là duy nhất, dùng chữ hoa/số/`_`/`-`; `name`; `administrativeArea` là Hải Dương hoặc Hải Phòng; `location` là GeoJSON Point `[longitude, latitude]` WGS84; `isActive` cho phép ngừng trạm mà vẫn giữ lịch sử. Index `2dsphere` dùng cho bản đồ và truy vấn không gian.

## WaterRecord

Gồm trạm, `measuredAt` ISO 8601 lưu UTC, sáu trường `ph`, `do`, `bod5`, `cod`, `tss`, `nh4`, đơn vị `mg/L; NH4+ as ion`, WQI/phân hạng có thể null, trạng thái `pending|verified|rejected` và nguồn `manual|excel`.

pH nằm trong [0,14], các nồng độ không âm. Các giới hạn kỹ thuật này không phải ngưỡng chất lượng nước hoặc chuẩn AI. Unique `(stationId, measuredAt)` tránh trùng. Khách chỉ xem bản ghi `verified` tại trạm active. Lọc thời gian dùng khoảng `[from,to)`.

## Prediction

Prediction mới dùng `ph, do, cod, nh4, po4, coliform`; ánh xạ native theo `Coliforms, Amoni, PH, Phosphat, DO, COD`. `nh4`/`po4` là khóa kỹ thuật, không mặc định analyte theo N/P. Cả sáu giá trị hữu hạn không âm, pH 0–14; không có miền train bàn giao nên không sao chép min/max Callisto.

Lưu user từ session, snapshot sáu đầu vào, `unitBasis=training-source-unverified`, `unitStatus=unverified`, `referenceBasis=lecturer-provided`, `modelVersion=callisto 2.0`, `algorithm=CatBoost`, `predictionSchemaVersion=catboost-top6-amoni-v1`, artifact SHA256, `rawWqi`, WQI nguyên, qualityClass, classificationVersion và createdAt. Ngày tạo prediction không phải thời gian quan trắc. Raw WQI phải trong 0–100; half-up và sáu dải WQI chỉ là chính sách hiển thị, chưa xác minh nguồn nhãn giảng viên.

Chỉ ghi sau AI success và validation đầy đủ. Không tự tạo WaterRecord. List/detail đọc toàn bộ lịch sử owner, giữ snapshot/units/model/output cũ; thiếu schemaVersion chỉ là bản ghi lịch sử, không bị viết lại. Những trường cũ không có trong bản ghi mới và ngược lại để trống trong export, không điền 0.

Tám cột ImportedRow, giá trị BOD5/Amoni và WaterRecord legacy độc lập với prediction. Không có migration hay recalculation. Đơn vị, external preprocessing, miền train và độ chính xác CatBoost vẫn chưa xác minh; hồ sơ Callisto chỉ áp dụng cho model cũ.
