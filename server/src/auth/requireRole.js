const UNAUTHORIZED_MESSAGE = 'Unauthorized';
const FORBIDDEN_MESSAGE = 'Forbidden';

export function requireRole(...allowedRoles) {
  const allowed = Array.isArray(allowedRoles[0])
    ? allowedRoles[0]
    : allowedRoles;

  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: UNAUTHORIZED_MESSAGE });
      return;
    }

    if (allowed.includes(req.user.role)) {
      next();
      return;
    }

    res.status(403).json({ error: FORBIDDEN_MESSAGE });
  };
}