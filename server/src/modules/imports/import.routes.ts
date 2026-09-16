import { Router } from 'express';
import multer from 'multer';
import { normalizeSchema } from '@wqi/contracts';
import * as controller from './import.controller.js';
import { adminOnly } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';

export const importRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }).single('file');
importRouter.use(adminOnly);
importRouter.get('/', controller.list);
importRouter.post('/preview', upload, controller.preview);
importRouter.post('/commit', upload, controller.commit);
importRouter.get('/:id/rows', controller.rows);
importRouter.post('/:id/rows/:rowId/normalize', validate(normalizeSchema), controller.normalize);
