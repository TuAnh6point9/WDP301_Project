# Hệ thống WQI An Kim Hải

Web quản lý dữ liệu chất lượng nước lịch sử, trạm quan trắc và cổng tích hợp dự đoán WQI. Stack: TypeScript, React/Vite, Express và MongoDB/Mongoose.

AI coding agents và thành viên mới bắt đầu tại [context.md](context.md) để nắm phạm vi, kiến trúc, quy ước và workflow trước khi sửa mã.

## Chạy local

Yêu cầu Node.js 22, npm 10 và MongoDB đang chạy. Tại PowerShell trong thư mục dự án:

```powershell
npm ci
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Chép chuỗi vừa tạo vào `SESSION_SECRET` trong `server/.env`, sau đó chạy:

```powershell
npm run db:indexes
npm run admin:create
npm run dev
```

Web mở tại `http://localhost:5173`; API ở `http://localhost:5000/api/v1`. Không có tài khoản, trạm hay số đo mặc định.

## Dữ liệu Excel

Admin nhập và quản lý dữ liệu qua **Dữ liệu Excel gốc**. File đã cung cấp có 756 dòng và tám cột `PH`, `Temp`, `BOD5`, `COD`, `DO`, `Amoni`, `Phosphat`, `Coliforms`.

Hệ thống giữ nguyên tám cột và không tự gán trạm, tọa độ, thời gian đo, TSS, NH4+ hoặc WQI. Chỉ khi Admin có thông tin thực, xác nhận đơn vị và kiểm định, bản ghi mới xuất hiện công khai. Không có dữ liệu thì giao diện hiển thị trạng thái trống.

## AI và quyền truy cập

- Khách xem trạm đang hoạt động và số liệu đã `verified`.
- User đăng nhập mới tính WQI và chỉ xem lịch sử của mình.
- Admin nhập/xuất Excel, quản lý trạm, kiểm định và tài khoản.
- `AI_MODE=disabled` mặc định: không trả WQI giả. Khi nhóm AI bàn giao API thật, đặt `AI_MODE=http`, `AI_SERVICE_URL` và tùy chọn `AI_API_KEY`.

## Kiểm tra và build

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

`npm start` phục vụ bản build ở `http://localhost:5000`. Giữ `NODE_ENV=development` khi chạy HTTP local; môi trường triển khai phải dùng HTTPS, `NODE_ENV=production`, MongoDB có xác thực và `SESSION_SECRET` riêng.

Xem thêm [kiến trúc](docs/architecture.md), [từ điển dữ liệu](docs/data-dictionary.md), [hợp đồng AI](docs/ai-contract.md) và [OpenAPI](docs/openapi.yaml).
