import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

export const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
};

// Multer throws its own MulterError (not an AppError) for things like an
// oversized file - translate the codes we actually configure into the
// same { statusCode, errorCode, message } shape everything else uses,
// rather than letting them fall through to a generic 500.
const MULTER_ERROR_MAP = {
  LIMIT_FILE_SIZE: { statusCode: 413, errorCode: 'FILE_TOO_LARGE', message: 'File is too large' },
  LIMIT_UNEXPECTED_FILE: { statusCode: 400, errorCode: 'UNEXPECTED_FILE_FIELD', message: 'Unexpected file field' },
};

const normalizeError = (err) => {
  if (err.name === 'MulterError') {
    const mapped = MULTER_ERROR_MAP[err.code] || { statusCode: 400, errorCode: 'UPLOAD_ERROR', message: 'File upload error' };
    return new AppError(mapped.message, mapped.statusCode, mapped.errorCode);
  }
  return err;
};

export const errorHandler = (rawErr, req, res, next) => {
  const err = normalizeError(rawErr);
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
    ...(isAppError && err.details ? { details: err.details } : {}),
    ...(env.NODE_ENV !== 'production' && !isAppError ? { stack: err.stack } : {}),
  });
};
