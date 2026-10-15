/** Requires a valid wallet session. Attaches req.session = { id, address, expiresAt }. */
export function requireSession(auth) {
  return async (req, _res, next) => {
    try {
      req.session = await auth.authenticate(req.get('authorization'));
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Requires a session whose address is the current on-chain contract owner. */
export function requireOwner(auth) {
  const session = requireSession(auth);
  return (req, res, next) =>
    session(req, res, async (err) => {
      if (err) return next(err);
      try {
        await auth.assertOwner(req.session.address);
        next();
      } catch (e) {
        next(e);
      }
    });
}
