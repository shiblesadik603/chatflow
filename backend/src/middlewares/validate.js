import { AppError } from '../utils/AppError.js';

export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    return next(
      new AppError('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten().fieldErrors)
    );
  }

  req.body = result.data;
  next();
};
