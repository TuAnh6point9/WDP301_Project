import { describe, expect, it } from 'vitest';
import { predictionParametersSchema, userSchema, USER_MESSAGES, validationIssueMessage, fieldErrorMessage, userErrorMessage, apiErrorMessage } from './index.js';

const valid={ph:7.2,do:5.7,cod:25,nh4:0.2,po4:0.3,coliform:5000};
describe('Vietnamese user messages',()=>{
  it.each([
    ['ph',-1,USER_MESSAGES.PH_RANGE],['ph',15,USER_MESSAGES.PH_RANGE],
    ['nh4',-1,USER_MESSAGES.NONNEGATIVE],['coliform',Infinity,USER_MESSAGES.INVALID_NUMBER],
    ['do',NaN,USER_MESSAGES.INVALID_NUMBER],['po4','1',USER_MESSAGES.INVALID_NUMBER],
    ['cod',undefined,USER_MESSAGES.REQUIRED_NUMBER],
  ])('localizes %s validation without changing rejection', (field,value,message)=>{
    const parsed=predictionParametersSchema.safeParse({...valid,[field as string]:value});
    expect(parsed.success).toBe(false);
    if(!parsed.success)expect(validationIssueMessage(parsed.error.issues[0])).toBe(message);
  });
  it.each([0,14])('keeps pH endpoint %s valid',ph=>{
    expect(predictionParametersSchema.safeParse({...valid,ph}).success).toBe(true);
  });
  it('retains unrestricted finite nonnegative measurements and their exact values',()=>{
    const parameters={...valid,nh4:1e5,coliform:1e100,cod:Number.MAX_VALUE,po4:0,do:20};
    expect(predictionParametersSchema.parse(parameters)).toEqual(parameters);
  });
  it('localizes nonnumeric schema issues without exposing Zod terminology',()=>{
    const result=userSchema.safeParse({name:'A',email:'bad',password:'a',role:'invalid'});
    expect(result.success).toBe(false);
    if(!result.success)expect(result.error.issues.map(validationIssueMessage)).toEqual([
      'Vui lòng nhập ít nhất 2 ký tự.',USER_MESSAGES.INVALID_FORMAT,'Vui lòng nhập ít nhất 12 ký tự.',USER_MESSAGES.INVALID_VALUE,
    ]);
  });
  it('never echoes unknown errors or backend field details',()=>{
    expect(userErrorMessage(new Error('Internal stack: database unavailable'))).toBe(USER_MESSAGES.INTERNAL);
    expect(fieldErrorMessage('parameters.nh4','Stack CODE_123')).toBe(USER_MESSAGES.INVALID_NUMBER);
    expect(apiErrorMessage(422,'UNKNOWN')).toBe(USER_MESSAGES.INVALID_DATA);
    expect(apiErrorMessage(422,'toString')).toBe(USER_MESSAGES.INVALID_DATA);
    expect(fieldErrorMessage('parameters.ph','Giá trị phải không âm')).toBe(USER_MESSAGES.PH_RANGE);
    expect(userErrorMessage(new Error(USER_MESSAGES.IMPORT_UNAVAILABLE))).toBe(USER_MESSAGES.IMPORT_UNAVAILABLE);
  });
});
