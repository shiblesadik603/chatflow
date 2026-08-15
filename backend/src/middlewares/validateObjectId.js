import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

// Without this, an invalid id (e.g. "abc") reaches Mongoose and throws a
// CastError, which would otherwise surface as an unhelpful 500.
export const validateObjectId = (paramName = 'id') => (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
    return next(new AppError(`Invalid ${paramName}`, 400, 'INVALID_ID'));
  }
  next();
};
