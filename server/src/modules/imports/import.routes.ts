import { Router } from 'express';
import multer from 'multer';
import * as controller from './import.controller.js';
import { adminOnly } from '../../middleware/authenticate.js';
import { audited } from '../audit/audit.service.js';

export const importRouter = Router();
// Two text fields: the commit's confirmed batch codes and overwrites, and the admin's fills (up to 10,000 rows).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, fieldSize: 1024 * 1024 } }).single('file');
importRouter.use(adminOnly);
importRouter.get('/', controller.list);
importRouter.get('/template', controller.template);
importRouter.post('/preview', audited('import.preview'), upload, controller.preview);
importRouter.post('/commit', audited('import.commit'), upload, controller.commit);
importRouter.get('/:id/rows', controller.rows);
