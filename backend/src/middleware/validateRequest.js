export function validateBody(requiredFields = []) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        error: { message: 'Request body must be a valid JSON object.' },
      });
    }

    const missing = requiredFields.filter((f) => req.body[f] === undefined || req.body[f] === null);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Missing required request fields: ${missing.join(', ')}`,
          missingFields: missing,
        },
      });
    }
    next();
  };
}
