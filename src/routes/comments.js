const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Only "admin" (main manager) and "moderator" may read comments —
// registrars and the public are not allowed to see them.
function requireAdminOrModerator(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== 'admin' && req.admin.role !== 'moderator') {
      return res.status(403).json({ error: 'Not allowed to view comments' });
    }
    next();
  });
}

// GET /api/comments - admin + moderator only now (was public).
router.get('/', requireAdminOrModerator, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM comments ORDER BY date DESC, id DESC');
  res.json(rows);
});

// Basic anti-spam: cap submissions per IP.
const commentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many comments submitted. Try again later.' },
});

// POST /api/comments - still public, so visitors can keep submitting.
router.post('/', commentLimiter, async (req, res) => {
  const { name, location, message, website } = req.body;
  if (website) {
    return res.status(201).json({ ok: true });
  }
  if (!name || !message) {
    return res.status(400).json({ error: 'name and message required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO comments (name, location, message) VALUES ($1, $2, $3) RETURNING *`,
    [name, location || null, message]
  );
  res.status(201).json(rows[0]);
});

// DELETE /api/comments/:id - full admin only (moderators can read but not delete now).
router.delete('/:id', requireAdmin, async (req, res) => {
  if (req.admin.role !== 'admin') {
    return res.status(403).json({ error: 'Full admin access required to delete comments' });
  }
  await pool.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
