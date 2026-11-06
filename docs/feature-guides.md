# Hướng dẫn biểu đồ và Excel

Bản local bổ sung hướng dẫn Việt–Anh cho các nghiệp vụ hiện có. Không thêm
endpoint, đầu vào AI hoặc định dạng xuất mới. Các nút trong
hướng dẫn chỉ điều hướng bước, đổi ngôn ngữ hoặc đóng hướng dẫn.

## Điểm mở và giai đoạn

| Màn hình | Giai đoạn | Số bước | Tự mở lần đầu |
|---|---|---:|---|
| Dữ liệu quan trắc `/historical-data` | Biểu đồ | 6 | Sau khi dữ liệu tải xong, kể cả dữ liệu trống |
| Tính WQI `/calculate` | Tính WQI thủ công (giới thiệu, nhập 6 thông số, bấm tính, đọc kết quả; bước "kiểm tra dữ liệu nguồn" bỏ ngày 06/11/2026 cùng tấm ghi chú) | 4 | Có, lần đầu vào trang |
| Tính WQI `/calculate` | Chuẩn bị Excel người dùng | 3 | Không, dùng nút riêng cạnh khu vực Excel |
| Lượt Excel `/excel/:id` | Xem trước | 3 | Khi xem trước đã tải xong |
| Lượt Excel `/excel/:id` | Đang chạy / tạm dừng | 2 | Không, người dùng chủ động mở |
| Lượt Excel `/excel/:id` | Kết quả | 3 | Khi trạng thái và bảng kết quả đã ổn định |
| Lịch sử `/history/excel` | Mở lại / tạo lượt khác | 2 | Không |
| Nhập Excel `/admin/import` | Chuẩn bị | 3 | Khi trang đã tải xong |
| Hộp bổ sung mã | Phạm vi, mã đợt, trạm, kiểm tra lại | 3 | Chỉ khi hộp nghiệp vụ thật mở |
| Nhập Excel quản trị | Kiểm tra trước lưu | 3 | Khi xem trước đã tải xong |
| Hộp ghi đè | Thay toàn bộ đợt, xác nhận lựa chọn | 2 | Chỉ khi hộp xác nhận thật mở |
| Nhập Excel quản trị | Sau lưu | 3 | Sau khi lưu và làm mới lịch sử xong |

Lỗi tải trang/file vẫn cho mở trợ giúp chủ động, với nội dung giữa màn hình
nếu không có mục tiêu. Các giai đoạn lỗi không tự mở. Hướng dẫn xử lý nền giữ
nguyên giai đoạn đang đọc; polling vẫn tiếp tục. Nếu kết quả đến trong lúc
hướng dẫn tiến trình mở, hướng dẫn kết quả chờ lượt hiện tại đóng.

## Ghi nhớ

Chính sách cập nhật ngày 05/11/2026 (phần khách sửa ngày 06/11/2026):

- **Khách chưa đăng nhập:** hướng dẫn tự mở một lần trên trình duyệt đó. Ngay khi
  hướng dẫn mở, nó được tính là đã xem (dù khách bỏ qua, hoàn tất hay rời trang);
  các lần sau, kể cả tải lại, không tự mở nữa. Mỗi hướng dẫn ghi riêng khóa
  `wqi.guide.guest.<guide>.v1` (luồng Excel `.v2`) với giá trị `seen`; storage bị
  chặn thì chỉ nhớ trong phiên trang. Khóa khách không bao giờ chặn tài khoản.
- **User/admin:** chỉ phiên đăng nhập thành công đầu tiên của tài khoản được tự
  mở các giai đoạn đủ điều kiện. Từ lần đăng nhập thứ hai, chỉ mở bằng nút, kể cả
  trên trình duyệt hoặc thiết bị khác, hoặc với tính năng chưa xem trong phiên đầu.
  Tải lại trong cùng phiên đầu không phải là đăng nhập mới.
- Nút hướng dẫn luôn cho mở lại. Các giai đoạn chủ động trong bảng trên vẫn giữ
  nguyên; không thêm hướng dẫn tự mở ở trang chủ hoặc dashboard.
- API ghi `User.guideLoginSeenAt` ẩn và `session.guideAutoStart`. `/auth/login`
  và `/auth/me` trả metadata `guidance.autoStart`, không thay đổi `data` hiện có.
  Tài khoản cũ có audit đăng nhập thành công được nhận diện là đã đăng nhập;
  audit chỉ còn 90 ngày nên tài khoản cũ không còn bằng chứng sẽ được xem là
  chưa ghi nhận. Không suy ra trạng thái tài khoản từ khóa trình duyệt cũ.
  Phiên cũ không có cờ mặc định chỉ mở chủ động. Không chạy migration hàng loạt.

Trong phiên đầu, tiến độ được lưu riêng cho từng tài khoản:

| Luồng | Khóa localStorage |
|---|---|
| WQI thủ công | `wqi.guide.account.<userId>.calculate.v1` |
| Biểu đồ | `wqi.guide.account.<userId>.chart.v1` |
| Excel người dùng | `wqi.guide.account.<userId>.excel-user.v1` |
| Excel quản trị | `wqi.guide.account.<userId>.excel-admin.v1` |

Ba luồng mới lưu JSON `{ "dismissed": false, "completed": ["prepare"] }`.
Hoàn tất chỉ thêm giai đoạn hiện tại vào `completed`. Bỏ qua hoặc Escape đặt
`dismissed: true` cho cả luồng; hoàn tất một lượt mở lại không xóa quyết định
bỏ qua. Các luồng và tài khoản độc lập. Khi storage bị chặn, dùng bộ nhớ trong
phiên trang; tải lại trong phiên đăng nhập đầu có thể hiện lại nếu không thể lưu.
Các phiên đăng nhập sau luôn bị chặn tự mở bởi trạng thái tài khoản ở server.

WQI thủ công đọc/ghi chuỗi `done` trong khóa tài khoản. Khóa global cũ không được
dùng để chặn khách hoặc tài khoản khác. Nút hướng dẫn mở
lại từ bước một của giai đoạn phù hợp bất kể trạng thái đã ghi nhớ.

## Trạng thái, bàn phím và bố cục

`client/src/components/guides/GuidedTour.tsx` quản lý hộp thoại native, tọa độ,
focus, điều phối một hướng dẫn và lưu trạng thái. Nội dung, mục tiêu và giai
đoạn được khai báo trong `client/src/features/guides/FeatureGuide.tsx`.

- Chuyển Việt–Anh giữ nguyên bước; không thay bản nháp hoặc gửi yêu cầu nghiệp vụ.
- Nút hướng dẫn tạm khóa khi đọc/gửi file, tính, lưu hoặc tải xuống.
- Bước cài đặt biểu đồ tạm mở bảng, sau đó khôi phục trạng thái mở/đóng trước đó.
  Không đổi cấu hình hiển thị hoặc ghi thiết lập trên trình duyệt.
- Hướng dẫn bên trong hộp bổ sung/ghi đè nằm trên hộp nghiệp vụ. Tab ở trong
  hướng dẫn; Escape chỉ đóng hướng dẫn và trả focus về nút mở trong hộp đó.
- Mục tiêu bị ẩn/không có thì hộp giải thích ở giữa. Nội dung dài cuộn được;
  nút trợ giúp xuống dòng trên màn hình nhỏ. Cuộn trang được phục hồi khi đóng.
- Sau bản biểu đồ theo mã đợt, bước chọn thông số đo chung vùng thẻ và nhóm
  “So sánh với” trên các phần tử hiện có, không thêm wrapper hoặc đổi bố cục.
  Nếu nhóm quá cao trên màn hình nhỏ, ưu tiên khung quanh vùng so sánh, giữ
  thanh điều hướng ở ngoài khung; hộp giải thích vẫn cuộn được.
- Kiểm thử kiểm tra cấu hình thực tế `wqi-trend-config-v3`, giữ nguyên thông số
  đã chọn và kích thước/vị trí các khu vực trước/sau khi xem hướng dẫn. Nhãn trợ
  năng ẩn của ô vượt giới hạn được neo trong ô để bảng không gây tràn ngang trang.

## Kiểm tra local

Kiểm tra sau khi đồng bộ `main` tại `871858a` ngày 05/11/2026: typecheck, lint,
build đạt; 425/425 bài kiểm thử toàn dự án và 25/25 E2E đạt. Khung biểu đồ đã
được kiểm tra ở 5 kích thước màn hình bằng cả Việt và Anh, giữ nguyên hình học
bố cục và lựa chọn thông số sau khi đóng. Kiểm thử trình duyệt với API
thật/database riêng xác nhận khách tải lại vẫn tự mở, user/admin chỉ tự mở trong
phiên đăng nhập đầu, đăng nhập lại sau khi xóa localStorage vẫn chỉ mở chủ động.
Đã kiểm tra hai tài khoản cùng trình duyệt, đăng nhập đồng thời, mật khẩu sai,
tài khoản khóa, hoàn tác khi lưu phiên lỗi và nhận diện audit của tài khoản cũ.
Các bài kiểm thử ghi dữ liệu dùng MongoDB cô lập, không dùng Atlas của nhóm.

```powershell
npm run typecheck
npm run lint
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.local/playwright'
$env:WQI_GUIDE_BROWSER_TEST = '1'
npm test -- --maxWorkers=2
# Web chạy trong terminal riêng: npm run dev:web
$env:E2E_CHANNEL = 'chrome'
$env:E2E_BASE_URL = 'http://127.0.0.1:5173'
npx playwright test e2e/calculate-guide.spec.ts e2e/feature-guides.spec.ts e2e/i18n.spec.ts
```

Các bài hướng dẫn dùng HTTP fixture và kiểm tra số lần gửi request. Kiểm thử
tích hợp ghi dữ liệu dùng MongoDB tạm riêng. Không chạy build frontend cùng
lúc với bài tích hợp phục vụ file build, và không chạy nhiều Playwright CLI
cùng thư mục output. Ảnh local, được Git bỏ qua:
`docs/local/screenshots/feature-guides/` và `docs/local/screenshots/wqi-guide/`.

Phạm vi nghiệp vụ được giữ như kế hoạch. Commit/push chỉ thực hiện sau yêu cầu
của người dùng và kiểm tra lại; tạo pull request và deploy là các bước riêng.

## Kết quả triển khai ban đầu ngày 04/11/2026

- Node 24.12.0: typecheck, lint và build đạt. Build còn cảnh báo chunk lớn
  có sẵn ở ứng dụng/bản đồ; không thêm dependency cho hướng dẫn.
- `npm test -- --maxWorkers=2`: **399/399 bài, 41 file**, không bỏ qua bài nào.
  Bao gồm 10 bài mới cho hướng dẫn dùng chung và 6 bài hồi quy WQI thủ công.
  Giới hạn worker để giảm tranh tài nguyên giữa MongoDB, Python và browser local.
- Playwright Chrome: **21/21 bài** trong ba file hướng dẫn WQI, hướng dẫn mới
  và song ngữ; gồm 7 kịch bản mới. Kiểm tra desktop, mobile 320 px, landscape,
  Tab/Escape, focus, polling, dữ liệu trống, lỗi file/lưu và model thay đổi.
- Tích hợp thật đạt: tính/xuất 10.000 dòng bằng CatBoost, browser upload đến
  tải kết quả, và khôi phục API với phiên đăng nhập cùng dữ liệu đã lưu.
  Bằng chứng local tại
  `docs/local/audits/evidence/wqi-batch-verification/runs/2026-11-04T08-40-40-129Z/`.
- Đã sửa và kiểm thử hồi quy lỗi cuộn mục tiêu cài đặt, tràn ngang do nút dài,
  trì hoãn hướng dẫn khi tải mẫu và fallback khi storage hết dung lượng.
- Đã rà soát diff theo correctness, security, performance, contracts, errors,
  tests và maintainability; không còn phát hiện cần sửa trong phần hướng dẫn.

Ảnh kiểm tra bằng HTTP fixture (không phải dữ liệu đã ghi Atlas):

- [Cài đặt biểu đồ, English](local/screenshots/feature-guides/chart-settings-en.png)
- [Biểu đồ trống trên mobile](local/screenshots/feature-guides/chart-empty-vi-mobile.png)
- [Kết quả Excel người dùng](local/screenshots/feature-guides/excel-user-results-vi.png)
- [Bổ sung mã trên mobile](local/screenshots/feature-guides/admin-fill-vi-mobile.png)
- [Hộp ghi đè quản trị](local/screenshots/feature-guides/admin-overwrite-vi.png)
- [Sau lưu, English mobile](local/screenshots/feature-guides/admin-results-en-mobile.png)

Lưu ý môi trường: script import local có sẵn, chưa được Git theo dõi
`server/src/scripts/import-historical-excel.ts`, dùng API cũ nên gây lỗi
typecheck sau lần pull main trước đó. Đã sao lưu tại
`.local/import-historical-excel.before-guide-validation.ts` và cập nhật kiểu
đọc kết quả theo API hiện tại; **không chạy script import** trong đợt này.
Các báo cáo và thay đổi local khác có từ trước được giữ nguyên.

## Rà soát trước khi push ngày 04/11/2026

Đối chiếu GitHub xác nhận mã nguồn nền là `origin/main` tại `f09aa4b`.
Đã tái hiện và sửa thêm ba vấn đề bằng kiểm thử trước khi sửa:

1. Target bị ẩn bằng CSS `visibility`/`opacity` vẫn có khung đánh dấu. Giờ dùng
   hộp giải thích giữa màn hình, cập nhật khi CSS đổi và bỏ qua mutation của
   chính hộp hướng dẫn để tránh vòng lặp định vị.
2. Đóng hướng dẫn ở bước cài đặt biểu đồ làm focus bị nút cài đặt lấy mất.
   Giờ hướng dẫn giữ quyền trả focus; mở/đóng bảng thủ công vẫn giữ hành vi cũ.
3. Hướng dẫn trong hộp bổ sung mã có thể tự mở khi tải mẫu chưa xong. Trạng thái
   bận giờ được truyền vào cả hướng dẫn bổ sung mã và xác nhận ghi đè.

Các file báo cáo, script import/migration, package scripts và cấu hình AI có
từ trước không thuộc commit hướng dẫn. Kiểm thử tiếp tục dùng database riêng.

Typecheck, lint và build đã chạy lại và đạt. Playwright Chrome đạt **22/22 bài**
sau các sửa lỗi trên, gồm kiểm tra target ẩn/hiện động và trả focus khi khôi
phục bảng cài đặt. Cảnh báo chunk lớn có sẵn vẫn còn, không chặn build.

`npm test -- --maxWorkers=2` chạy lại đạt **400/400 bài trong 41 file**, không
bỏ qua bài nào; gồm 11 bài hướng dẫn dùng chung. Tích hợp CatBoost 10.000 dòng,
browser và khôi phục tiến trình/phiên đều đạt. Bằng chứng lần chạy cuối ở
`docs/local/audits/evidence/wqi-batch-verification/runs/2026-11-04T08-56-05-114Z/`.
Rà soát phần staged: không còn blocker hoặc should-fix cần xử lý trước push.

## Sửa bố cục hướng dẫn ngày 05/11/2026

Ảnh kiểm tra thực tế cho thấy hộp giải thích bước nhập sáu thông số che lên
chính form được đánh dấu. Kiểm thử cũ chỉ kiểm tra hộp nằm trong viewport,
chưa kiểm tra giao nhau giữa hộp và vùng đánh dấu.

- Bỏ cách đặt hộp ở giữa vùng đang giới thiệu khi thiếu khoảng trống. Trên
  desktop, hộp thu hẹp sang bên hoặc đặt ở khoảng trống phía trên/dưới form.
- Khi hộp bị giới hạn chiều cao, dùng bố cục gọn, giữ nút điều hướng và cho
  cuộn nội dung. Giữ vị trí cuộn khi đo lại bố cục; cuộn lời giải thích không
  làm định vị lại mục tiêu hoặc cuộn trang phía sau.
- Với mục tiêu dài hơn màn hình điện thoại, hộp ở một vùng riêng phía dưới;
  khung chỉ đánh dấu phần mục tiêu đang nhìn thấy phía trên hộp.
- Giữ nguyên bước, ngôn ngữ, bản nháp, lựa chọn nghiệp vụ và quy tắc ghi nhớ.

Kiểm thử trình duyệt bổ sung kiểm tra hình học không giao nhau, gồm khách chưa
đăng nhập và người dùng đã đăng nhập, các bước Excel chuẩn bị/xem trước/xử
lý/kết quả/lịch sử, biểu đồ và các hộp bổ sung mã/ghi đè. Kích thước kiểm tra:
1536×720, 1280×720, 1365×900, 390×844, 320×568 và 844×390; kiểm tra thêm cuộn
đến lời giải thích thông số cuối cùng trong hộp gọn.

Ảnh local sau sửa:
[cạnh form](local/screenshots/wqi-guide/guest-inputs-1536.png),
[dưới form](local/screenshots/wqi-guide/guest-inputs-1280.png).

Kết quả bản sửa cuối: typecheck, lint, build đạt; **400/400 bài trong 41 file**
và **23/23 E2E** đạt. Kiểm thử browser đi qua mọi bước của các hướng dẫn trên,
giữ kiểm tra dữ liệu/bản nháp/ghi nhớ/ngôn ngữ, bổ sung kiểm tra cuộn nội dung
bằng bánh xe chuột. Lần chạy trong lúc sửa có HMR làm khởi tạo lại bộ nhớ
storage của bài i18n; lượt cuối chạy khi mã nguồn ổn định đã đạt đầy đủ.

Đã kiểm tra thêm web thật ở `http://localhost:5173/calculate` với khách chưa
đăng nhập: cả sáu ô hiện rõ, cuộn lời giải thích hoạt động, không có lỗi
JavaScript. API/Atlas và AI vẫn sẵn sàng; các bài ghi dữ liệu dùng MongoDB tạm.
Bằng chứng tích hợp cuối:
`docs/local/audits/evidence/wqi-batch-verification/runs/2026-11-05T03-06-54-005Z/`.
Bản sửa chỉ thay đổi bố cục hướng dẫn và kiểm thử hồi quy, giữ nguyên API,
schema, phân quyền và các thao tác nghiệp vụ.
