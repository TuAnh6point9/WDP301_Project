# MongoDB Atlas deployment

Ứng dụng đã hỗ trợ URI `mongodb+srv://` qua Mongoose. Không đưa connection string, mật khẩu hoặc file `.env` lên Git.

## 1. Tạo tài nguyên Atlas

1. Tạo một Atlas project và cluster.
2. Trong **Database Access**, tạo database user riêng cho ứng dụng. Production chỉ cấp quyền `readWrite` trên database `akh_wqi`; không dùng tài khoản Atlas cá nhân hoặc quyền quản trị rộng cho runtime.
3. Trong **Network Access**, cho phép IP outbound của backend đã deploy. Chỉ dùng `0.0.0.0/0` khi nền tảng không cung cấp IP cố định, và phải bảo vệ bằng mật khẩu mạnh cùng database user giới hạn quyền.
4. Chọn **Connect → Drivers → Node.js** và lấy URI dạng `mongodb+srv://`.
5. Nếu username hoặc password có ký tự đặc biệt, percent-encode chúng trong URI.

## 2. Cấu hình local để kiểm tra Atlas

Đặt URI vào `server/.env` trên máy cá nhân:

```dotenv
MONGODB_URI=mongodb+srv://APP_USER:PASSWORD@CLUSTER.mongodb.net/akh_wqi?retryWrites=true&w=majority
```

Không sửa `server/.env.example` thành URI thật. Sau đó chạy:

```powershell
npm run db:status
npm run db:indexes
npm run db:status
```

`db:indexes` chỉ tạo indexes còn thiếu, không seed và không xóa dữ liệu. `db:status` chỉ hiển thị hostname, tên database, collection và số document; không in URI hoặc mật khẩu.

Database Atlas mới sẽ chưa có tài khoản. Tạo Admin đầu tiên bằng:

```powershell
npm run admin:create
```

Nếu cần chuyển dữ liệu production cũ, dùng MongoDB Database Tools `mongodump`/`mongorestore` trong thời gian dừng ghi. Database local hiện chỉ có tài khoản Admin và không có Station/WaterRecord, nên có thể tạo Admin mới trên Atlas thay vì sao chép toàn bộ database local.

## 3. Biến môi trường khi deploy backend

Thiết lập trong secret/environment settings của nền tảng deploy:

```dotenv
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
SESSION_SECRET=<chuỗi ngẫu nhiên tối thiểu 32 ký tự>
CLIENT_ORIGIN=https://ten-mien-frontend.example
TRUST_PROXY=1
AI_MODE=disabled
```

Không đặt `VITE_API_BASE_URL` thành Atlas URI. Trình duyệt chỉ gọi backend; chỉ backend được kết nối trực tiếp tới database.

Sau mỗi lần triển khai model/index mới, chạy `npm run db:indexes` như release command hoặc one-off command của nền tảng. Lệnh start production là `npm start`.

## 4. Ý nghĩa “cập nhật theo thời gian thực”

Mọi thao tác tạo/sửa/kiểm định qua API được ghi ngay vào Atlas và phiên bản web sau đó sẽ đọc dữ liệu mới. Đây là hành vi hiện tại của ứng dụng.

Nếu nhiều trình duyệt đang mở phải tự thấy thay đổi mà không tải lại trang, cần triển khai thêm SSE hoặc WebSocket. MongoDB change streams có thể làm nguồn sự kiện trên Atlas, nhưng browser không được kết nối trực tiếp với change stream; backend phải lắng nghe thay đổi rồi phát sự kiện đã phân quyền tới client. Đây là tính năng riêng, không phải điều kiện để database online hoạt động.

## 5. Kiểm tra sau deploy

1. Gọi `GET /api/v1/health/live` và nhận HTTP 200.
2. Gọi `GET /api/v1/health/ready` và nhận HTTP 200 với `database: connected`.
3. Đăng nhập Admin, tạo một Station và kiểm tra document xuất hiện trong Atlas.
4. Tạo WaterRecord, kiểm định và kiểm tra dữ liệu công khai.
5. Khởi động lại backend và xác nhận dữ liệu vẫn tồn tại.
