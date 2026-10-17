import crypto from 'node:crypto';
import { AppError } from '../lib/errors.js';

export function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

/** Converts errors to safe JSON. Internal details are logged, never returned. */
export function createErrorHandler(logger, { production = false } = {}) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    let status = 500;
    let body = { code: 'INTERNAL_ERROR', message: 'Internal server error' };

    if (err instanceof AppError) {
      status = err.status;
      body = { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) };
    } else if (err?.type === 'entity.parse.failed') {
      status = 400;
      body = { code: 'INVALID_JSON', message: 'Request body is not valid JSON' };
    } else if (err?.type === 'entity.too.large') {
      status = 413;
      body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
    }

    if (status >= 500) {
      logger.error('Request failed', { requestId: req.id, path: req.path, method: req.method, code: body.code });
      if (production) body = { code: body.code, message: 'Service temporarily unavailable; retry or contact the team with the request ID' };
    }
    res.status(status).json({ success: false, error: { ...body, requestId: req.id } });
  };
}

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}`, requestId: req.id } });
}
