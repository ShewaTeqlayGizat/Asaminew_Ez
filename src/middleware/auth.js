const jwt = require('jsonwebtoken');

// Protects any admin-only route: requires a valid login, but allows BOTH
// roles (admin and moderator). Used for reading admin-only data and for
// comment moderation, which moderators are allowed to do.
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload; // { id, username, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Protects full-access routes only: uploading, editing, and deleting site
// content. Moderators are logged-in admins too, but are NOT allowed here —
// only accounts with role "admin" (the main manager) pass this check.
function requireSuperAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== 'admin') {
      return res.status(403).json({ error: 'Full admin access required for this action' });
    }
    next();
  });
}

module.exports = { requireAdmin, requireSuperAdmin };
