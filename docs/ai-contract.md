# Hợp đồng AI Service

Mặc định `AI_MODE=disabled`, API trạng thái trả `available: false` và form không tạo kết quả giả. Để bật, nhóm AI phải bàn giao đơn vị, tiền xử lý, miền đầu vào, quy tắc phân hạng, phiên bản mô hình và bộ mẫu đối chiếu.

Backend gửi HTTP POST JSON:

```ts
type AiRequest = {
  parameters: { ph: number; do: number; bod5: number; cod: number; tss: number; nh4: number };
  unitBasis: 'mg/L; NH4+ as ion';
};
```

AI trả object trực tiếp, không bọc `data`:

```ts
type AiResponse = {
  wqi: number; // 0..100
  qualityClass: string;
  modelVersion: string;
  classificationVersion: string;
};
```

Timeout mặc định 10 giây. Lỗi kết nối/response sai không ghi prediction thành công. Backend không gửi URL AI ra client, không tự retry POST và không thay kết quả bằng mock.
