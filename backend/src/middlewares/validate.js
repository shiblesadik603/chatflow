import { AppError } from '../utils/AppError.js';

// source lets the same middleware validate req.body, req.query, or req.params.
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    return next(
      new AppError('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten().fieldErrors)
    );
  }

  req[source] = result.data;
  next();
};
