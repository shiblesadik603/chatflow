import * as dashboardService from '../services/dashboardService.js';

export const getStatus = async (req, res, next) => {
  try {
    const status = await dashboardService.getStatus();
    res.status(200).json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
};
