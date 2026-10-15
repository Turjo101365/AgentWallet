import { badRequest } from '../lib/errors.js';

/** Validates req[part] against a zod schema; unknown keys are rejected when the schema is strict. */
export function validate(schema, part = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      return next(
        badRequest('VALIDATION_FAILED', 'Request failed validation', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }))),
      );
    }
    req.valid = { ...(req.valid || {}), [part]: result.data };
    next();
  };
}
