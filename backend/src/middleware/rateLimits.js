import rateLimit from 'express-rate-limit';

const handler = (req, res) =>
  res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down', requestId: req.id } });

/** In-memory limiter: adequate for a single backend instance; use a shared store if scaled out. */
export function createRateLimits({ disabled = false } = {}) {
  const make = (windowMs, limit) =>
    disabled ? (_req, _res, next) => next() : rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, handler });
  return {
    global: make(60_000, 300),
    auth: make(60_000, 20),
    mutation: make(60_000, 60),
    publicRead: make(60_000, 30),
    publicAssess: make(60_000, 10),
    publicAi: make(3_600_000, 3),
  };
}
