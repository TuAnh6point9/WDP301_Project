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

Lưu user sở hữu, snapshot sáu đầu vào, kết quả AI, phân hạng, model/classification version và thời điểm. Một prediction không tự tạo WaterRecord. Chỉ ghi khi AI trả response hợp lệ.
