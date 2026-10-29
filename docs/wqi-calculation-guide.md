# Hướng dẫn tính WQI

Hướng dẫn trực tiếp trên `/calculate`, gồm năm bước: bắt đầu, sáu thông số,
kiểm tra dữ liệu, tính WQI và đọc kết quả. Trang này yêu cầu đăng nhập như trước.
Hướng dẫn dùng được khi AI chưa sẵn sàng và không tạo yêu cầu tính/lưu dữ liệu.

- Tự mở lần đầu sau khi trang chuyển xong. Nút **Hướng dẫn tính WQI** cạnh tiêu đề
  cho phép mở lại từ bước đầu, với cả người dùng cũ và mới.
- **Bỏ qua**, Escape và **Hoàn tất** đều đóng hướng dẫn, trả focus về nút mở và
  ghi `localStorage['wqi.guide.calculate.v1'] = 'done'`.
- Trạng thái áp dụng cho trình duyệt, không gắn với tài khoản. Xóa dữ liệu trang
  hoặc dùng trình duyệt khác sẽ có lần tự mở mới. Lưu trữ bị chặn thì ghi nhớ
  trong bộ nhớ của phiên trang hiện tại; mở lại bằng nút vẫn hoạt động.
- Ngôn ngữ theo lựa chọn Việt–Anh hiện tại, có bộ chuyển trong hộp hướng dẫn.
  Đổi ngôn ngữ giữ nguyên bước, các giá trị và lỗi trong form.
- Trong lúc tính hoặc tải Excel lên, nút mở hướng dẫn tạm bị khóa. Hướng dẫn
  không tự nhập giá trị, đặt lại form, gửi yêu cầu hay điều hướng sang kết quả.
- Hộp thoại dùng bàn phím, giữ focus bên trong, có nội dung cuộn trên màn hình
  nhỏ và giảm tối vùng ngoài khung đánh dấu. Nếu mục tiêu bị ẩn hoặc nằm ngoài
  màn hình, nội dung hướng dẫn xuất hiện ở giữa.

Giữ nguyên API, schema MongoDB, validation, đơn vị và mô hình. Bước cuối chỉ
giải thích trang kết quả và lịch sử, không tạo điểm WQI minh họa. Hướng dẫn
biểu đồ và Excel nằm ngoài phiên bản này.

## Kiểm thử

```powershell
npm run typecheck
npm run lint
npm run build
npm test
# Khởi động web local trong terminal riêng: npm run dev:web
$env:E2E_CHANNEL='chrome'
$env:E2E_BASE_URL='http://127.0.0.1:5173'
npx playwright test e2e/calculate-guide.spec.ts e2e/i18n.spec.ts
```

Trên máy đang dùng, Chromium headless đã nằm trong `.local/playwright`. Để
`npm test` tìm đúng trình duyệt cho bài tích hợp backend có browser, đặt biến
cho terminal đó trước khi chạy (không cần cài thêm trình duyệt):

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.local/playwright'
npm test
```

Các kiểm thử giao diện hướng dẫn dùng HTTP fixture trong trình duyệt, không
kết nối Atlas. Chúng kiểm tra tự mở, bỏ qua/hoàn tất/reload, mở lại, Tab/Escape,
focus, giữ bản nháp/lỗi, chuyển ngôn ngữ, AI offline, storage bị chặn, mục tiêu
bị ẩn, nút mở trong lúc gửi yêu cầu, và các viewport 320×568, 390×844, 844×390.
Sau khi đóng hướng dẫn, kiểm thử xác nhận form gửi đúng sáu giá trị một lần.

Các fixture hồi quy tính WQI/Excel/i18n khác khai báo đã xem hướng dẫn để tiếp
tục kiểm tra luồng của chúng. Ảnh kiểm tra nằm trong thư mục local được bỏ qua
bởi Git: `docs/local/screenshots/wqi-guide/`.

## Kết quả kiểm tra ngày 29/10/2026

- Node 24.12.0: typecheck, lint và build đạt. Build còn cảnh báo bundle lớn
  đã có trước đó; không thêm dependency cho hướng dẫn.
- `npm test`: 256/256 bài đạt, 29 file, khi dùng đường dẫn trình duyệt local
  nêu trên. Bao gồm sáu bài mới cho hướng dẫn, model CatBoost thật, 10.000
  dòng, luồng Excel qua trình duyệt và khôi phục API sau khi dừng tiến trình.
- Playwright với Chrome: 14/14 bài đạt, gồm năm bài hướng dẫn và chín bài
  hồi quy giao diện Việt–Anh. Đã xem lại ảnh desktop và mobile.
- Lần chạy toàn bộ đầu tiên có một bài không khởi chạy được trình duyệt do
  thiếu đường dẫn cache mặc định. Chạy lại bằng trình duyệt sẵn có trong
  `.local/playwright` đã đạt đầy đủ; không bỏ qua bài kiểm thử nào.
- Rà soát thay đổi: không còn phát hiện cần sửa trong phần hướng dẫn. Kiểm
  thử ghi dữ liệu dùng MongoDB riêng; không ghi Atlas, commit, push hay deploy.
