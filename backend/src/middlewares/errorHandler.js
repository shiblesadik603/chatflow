import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

export const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
};

export const errorHandler = (err, req, res, next) => {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const errorCode = isAppError ? err.errorCode : 'INTERNAL_SERVER_ERROR';
  const message = isAppError || env.NODE_ENV !== 'production' ? err.message : 'Something went wrong';

  if (isAppError) {
    logger.warn(`${errorCode}: ${err.message}`);
  } else {
    logger.error(err.stack || err.message);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorCode,
    ...(env.NODE_ENV !== 'production' && !isAppError ? { stack: err.stack } : {}),
  });
};
