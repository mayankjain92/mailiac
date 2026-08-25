import { Router, type IRouter } from 'express';
import { AnalysisReportModel } from '@mailiac/db';

export const reportsRouter: IRouter = Router();


reportsRouter.get('/reports/:id', async (req, res) => {
  // TODO: implement connectDb call before querying (called once at app startup)
  const report = await AnalysisReportModel.findOne({ messageId: req.params['id'] }).lean();

  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  res.json(report);
});
