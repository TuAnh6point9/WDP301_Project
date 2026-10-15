import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { predictionParametersSchema } from '@wqi/contracts';
import { errorHandler } from '../src/middleware/error-handler.js';
import multer from 'multer';

const app=express();
app.use(express.json());
app.use((_req,res,next)=>{res.locals.requestId='message-audit';next();});
app.post('/parameters',(req,res)=>{res.json({data:predictionParametersSchema.parse(req.body)});});
app.post('/upload',(_req,_res,next)=>next(new multer.MulterError('LIMIT_UNEXPECTED_FILE')));
app.use(errorHandler);
describe('Vietnamese backend validation envelope',()=>{
  it('does not misreport an unexpected upload field as an oversized file',async()=>{
    const response=await request(app).post('/upload');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({code:'UPLOAD_ERROR',message:'Tệp tải lên chưa hợp lệ, vui lòng kiểm tra lại.'});
  });
  it('keeps the 400/code/field/requestId envelope while localizing the message',async()=>{
    const response=await request(app).post('/parameters').send({ph:-1,do:6,cod:3,nh4:-1,po4:0.1,coliform:100});
    expect(response.status).toBe(400);
    expect(response.body).toEqual({error:{code:'VALIDATION_ERROR',message:'Dữ liệu chưa hợp lệ, vui lòng kiểm tra lại.',requestId:'message-audit',details:[
      {field:'ph',message:'pH phải nằm trong khoảng 0–14.'},{field:'nh4',message:'Giá trị không được âm.'},
    ]}});
  });
});
