import { AppError } from '../utils/AppError.js';

// source lets the same middleware validate req.body, req.query, or req.params.
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    // Field-level errors (e.g. "email: invalid") land in fieldErrors.
    // Whole-object .refine() errors (e.g. "provide at least one field")
    // have no field path, so Zod puts them in formErrors instead - surface
    // both, or object-level validation failures would come back as {}.
    const { fieldErrors, formErrors } = result.error.flatten();
    const details = formErrors.length ? { ...fieldErrors, _form: formErrors } : fieldErrors;
    return next(new AppError('Validation failed', 422, 'VALIDATION_ERROR', details));
  }

  req[source] = result.data;
  next();
};
