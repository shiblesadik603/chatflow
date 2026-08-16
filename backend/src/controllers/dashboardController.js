import * as dashboardService from '../services/dashboardService.js';

export const getStatus = async (req, res, next) => {
  try {
    const status = await dashboardService.getStatus();
    res.status(200).json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
};

export const simulateRedisDown = async (req, res, next) => {
  try {
    const result = await dashboardService.simulateRedisDown();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const restoreRedis = async (req, res, next) => {
  try {
    const result = await dashboardService.restoreRedis();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
