import { parametersSchema, aiResultSchema, type Parameters } from '@wqi/contracts';
import { getEnv } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';

export async function predictWqi(parameters: Parameters) {
  const env = getEnv();
  if (env.AI_MODE === 'disabled') throw new AppError(503, 'AI_NOT_CONFIGURED', 'Chức năng dự đoán chưa khả dụng.');
  parametersSchema.parse(parameters);
  try {
    const response = await fetch(env.AI_SERVICE_URL, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', ...(env.AI_API_KEY ? { Authorization: `Bearer ${env.AI_API_KEY}` } : {}) },
      body: JSON.stringify({ parameters, unitBasis: 'mg/L; NH4+ as ion' }),
    });
    if (!response.ok) throw new AppError(502, 'AI_UPSTREAM_ERROR', 'Dịch vụ AI không xử lý được yêu cầu.');
    const reader = response.body?.getReader();
    if (!reader) throw new AppError(502, 'AI_INVALID_RESPONSE', 'Dịch vụ AI trả về kết quả không hợp lệ.');
    let size = 0;
    const parts: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 16384) { await reader.cancel(); throw new AppError(502, 'AI_INVALID_RESPONSE', 'Kết quả AI vượt giới hạn.'); }
      parts.push(part.value);
    }
    let payload: unknown;
    try { payload = JSON.parse(Buffer.concat(parts).toString('utf8')); }
    catch { throw new AppError(502, 'AI_INVALID_RESPONSE', 'Dịch vụ AI trả về JSON không hợp lệ.'); }
    const result = aiResultSchema.safeParse(payload);
    if (!result.success) throw new AppError(502, 'AI_INVALID_RESPONSE', 'Dịch vụ AI trả về kết quả không hợp lệ.');
    return result.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new AppError(504, 'AI_TIMEOUT', 'Dịch vụ AI phản hồi quá thời gian cho phép.');
    throw new AppError(502, 'AI_UNAVAILABLE', 'Không thể kết nối hoặc đọc kết quả từ dịch vụ AI.');
  }
}
