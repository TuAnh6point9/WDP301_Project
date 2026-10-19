import { USER_MESSAGES as M } from '@wqi/contracts';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { getEnv } from './config/env.js';
import { csrfProtection, loadUser } from './middleware/authenticate.js';
import { errorHandler } from './middleware/error-handler.js';
import { AppError } from './utils/app-error.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { userRouter } from './modules/users/user.routes.js';
import { stationRouter } from './modules/stations/station.routes.js';
import { recordRouter } from './modules/water-records/water-record.routes.js';
import { importRouter } from './modules/imports/import.routes.js';
import { predictionRouter } from './modules/predictions/prediction.routes.js';
import { reportRouter } from './modules/reports/report.routes.js';
import { predictionBatchRouter } from './modules/prediction-batches/batch.routes.js';

export function createApp(store?: session.Store) {
  const env = getEnv();
  const app = express();
  const origins = env.CLIENT_ORIGIN.split(',').map(origin => origin.trim());
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use((req, res, next) => { res.locals.requestId = randomUUID(); res.setHeader('X-Request-ID', res.locals.requestId); next(); });
  app.use(helmet({ contentSecurityPolicy: { directives: {
    'script-src': ["'self'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://server.arcgisonline.com', 'https://tiles.goong.io'],
    'connect-src': ["'self'", 'https://tiles.goong.io'],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'frame-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'upgrade-insecure-requests': env.NODE_ENV === 'production' ? [] : null,
  } } }));
  app.use(cors({ origin: origins, credentials: true }));
  if (env.NODE_ENV !== 'test') app.use(morgan('dev'));
  app.get('/api/v1/health/live', (_req, res) => res.json({ data: { status: 'ok' } }));
  app.get('/api/v1/health/ready', (_req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ data: { database: mongoose.connection.readyState === 1 ? 'connected' : 'unavailable' } }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '64kb' }));
  const sessionStore = store ?? MongoStore.create({ mongoUrl: env.MONGODB_URI, collectionName: 'sessions', ttl: 8 * 60 * 60 });
  app.locals.sessionStore = sessionStore;
  app.use(session({
    name: 'akh.sid', secret: env.SESSION_SECRET, resave: false, saveUninitialized: false,
    store: sessionStore,
    cookie: { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
  }));
  app.use('/api/v1', csrfProtection(origins), loadUser);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', userRouter);
  app.use('/api/v1', recordRouter);
  app.use('/api/v1/stations', stationRouter);
  app.use('/api/v1/imports', importRouter);
  app.use('/api/v1/predictions', predictionRouter);
  app.use('/api/v1/prediction-batches', predictionBatchRouter);
  app.use('/api/v1/reports', reportRouter);
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', M.NOT_FOUND)));
  const clientDist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  if ((env.NODE_ENV === 'production' || process.argv.includes('--serve-client')) && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*path}', (_req, res) => res.sendFile(`${clientDist}/index.html`));
  }
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', M.NOT_FOUND)));
  app.use(errorHandler);
  return app;
}
