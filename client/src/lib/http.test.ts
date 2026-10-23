// @vitest-environment jsdom
// Preserve the original English-copy regression fixtures; bilingual behavior has its own tests.
import { beforeEach as beforeEnglishFixture } from 'vitest';
import { i18n } from '@/i18n';
beforeEnglishFixture(async () => { await i18n.changeLanguage('en'); });
import { afterEach, describe, expect, it } from 'vitest';
import { AxiosError, type AxiosAdapter } from 'axios';
import { http, setCsrfToken } from './http';

const originalAdapter=http.defaults.adapter;
afterEach(()=>{http.defaults.adapter=originalAdapter;setCsrfToken(null);});
function fail(status: number, code?: string, message='Technical failure: internal stack and CODE_123') {
  http.defaults.adapter=async config=>{throw new AxiosError('Axios technical detail','ERR_BAD_RESPONSE',config,undefined,{status,statusText:'Error',headers:{},config,data:{error:{code,message,requestId:'safe-id'}}});};
}
describe('English HTTP errors',()=>{
  it.each([
    [400,'Some data is invalid. Please check and try again.'],
    [401,'Please sign in to continue.'],
    [403,'You do not have permission to perform this action.'],
    [404,'The requested data was not found.'],
    [409,'The data has changed. Please reload before trying again.'],
    [422,'Some data is invalid. Please check and try again.'],
    [429,'Please wait a moment before trying again.'],
    [500,'The request could not be processed. Please try again later.'],
    [502,'The request cannot be processed right now. Please try again later.'],
    [503,'This feature is not available right now. Please try again later.'],
    [504,'No response was received. Please try again later.'],
  ])('localizes HTTP %s without displaying raw server messages',async(status,message)=>{
    fail(Number(status),'UNKNOWN_CODE');
    await expect(http.get('/audit')).rejects.toMatchObject({status,code:'UNKNOWN_CODE',message,requestId:'safe-id'});
  });
  it('localizes invalid credentials by code',async()=>{
    fail(401,'INVALID_CREDENTIALS');
    await expect(http.get('/audit')).rejects.toMatchObject({message:'Incorrect email or password.'});
  });
  it.each(['ECONNABORTED','ETIMEDOUT','ERR_NETWORK'])('handles %s without technical text',async code=>{
    http.defaults.adapter=(async config=>{throw new AxiosError('Raw network error',code,config);}) as AxiosAdapter;
    await expect(http.get('/audit')).rejects.toMatchObject({message:code==='ERR_NETWORK'?'Could not connect. Please try again later.':'No response was received. Please try again later.'});
  });
});
