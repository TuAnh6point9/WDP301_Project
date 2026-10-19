import { Router } from 'express';
import { adminOnly } from '../../middleware/authenticate.js';
import { createdRange } from '../../middleware/validate.js';
import { User } from '../users/user.model.js';
import { Station } from '../stations/station.model.js';
import { ImportBatch } from '../imports/import.model.js';
import { WaterRecord } from '../water-records/water-record.model.js';
import { Prediction } from '../predictions/prediction.model.js';

export const dashboardRouter = Router();
// Counts only: prediction contents stay private to their owners, even for admins.
dashboardRouter.get('/summary', adminOnly, async (req, res) => {
  const created = createdRange(req.query);
  const [users, activeUsers, admins, activeStations, batches, rows, records, predictions] = await Promise.all([
    User.countDocuments(created), User.countDocuments({ ...created, isActive: true }), User.countDocuments({ ...created, role: 'admin' }),
    Station.countDocuments({ ...created, isActive: true }),
    ImportBatch.countDocuments(created),
    ImportBatch.aggregate<{ rows: number }>([{ $match: created }, { $group: { _id: null, rows: { $sum: '$rowCount' } } }]),
    WaterRecord.aggregate<{ _id: string; count: number }>([{ $match: created }, { $group: { _id: '$validationStatus', count: { $sum: 1 } } }]),
    Prediction.countDocuments(created),
  ]);
  const byStatus = Object.fromEntries(records.map(record => [record._id, record.count]));
  res.json({ data: {
    users: { total: users, active: activeUsers, admins }, stations: { active: activeStations },
    imports: { batches, rows: rows[0]?.rows ?? 0 },
    records: { pending: byStatus.pending ?? 0, verified: byStatus.verified ?? 0, rejected: byStatus.rejected ?? 0 },
    predictions,
  } });
});
