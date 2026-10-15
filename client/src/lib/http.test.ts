// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { AxiosError, type AxiosAdapter } from 'axios';
import { http, setCsrfToken } from './http';

const originalAdapter=http.defaults.adapter;
afterEach(()=>{http.defaults.adapter=originalAdapter;setCsrfToken(null);});
function fail(status: number, code?: string, message='Technical failure: internal stack and CODE_123') {
  http.defaults.adapter=async config=>{throw new AxiosError('Axios technical detail','ERR_BAD_RESPONSE',config,undefined,{status,statusText:'Error',headers:{},config,data:{error:{code,message,requestId:'safe-id'}}});};
}
describe('Vietnamese HTTP errors',()=>{
  it.each([
    [400,'Dữ liệu chưa hợp lệ, vui lòng kiểm tra lại.'],
    [401,'Vui lòng đăng nhập để tiếp tục.'],
    [403,'Bạn chưa được phép thực hiện thao tác này.'],
    [404,'Không tìm thấy dữ liệu được yêu cầu.'],
    [409,'Dữ liệu đã thay đổi, vui lòng tải lại trước khi thử lại.'],
    [422,'Dữ liệu chưa hợp lệ, vui lòng kiểm tra lại.'],
    [429,'Vui lòng đợi một chút trước khi thử lại.'],
    [500,'Không thể xử lý yêu cầu, vui lòng thử lại sau.'],
    [502,'Hiện chưa thể xử lý yêu cầu, vui lòng thử lại sau.'],
    [503,'Chức năng này hiện chưa sẵn sàng, vui lòng thử lại sau.'],
    [504,'Chưa nhận được phản hồi, vui lòng thử lại sau.'],
  ])('localizes HTTP %s without displaying raw server messages',async(status,message)=>{
    fail(Number(status),'UNKNOWN_CODE');
    await expect(http.get('/audit')).rejects.toMatchObject({status,code:'UNKNOWN_CODE',message,requestId:'safe-id'});
  });
  it('localizes invalid credentials by code',async()=>{
    fail(401,'INVALID_CREDENTIALS');
    await expect(http.get('/audit')).rejects.toMatchObject({message:'Email hoặc mật khẩu không đúng.'});
  });
  it.each(['ECONNABORTED','ETIMEDOUT','ERR_NETWORK'])('handles %s without technical text',async code=>{
    http.defaults.adapter=(async config=>{throw new AxiosError('Raw network error',code,config);}) as AxiosAdapter;
    await expect(http.get('/audit')).rejects.toMatchObject({message:code==='ERR_NETWORK'?'Không thể kết nối, vui lòng thử lại sau.':'Chưa nhận được phản hồi, vui lòng thử lại sau.'});
  });
});
