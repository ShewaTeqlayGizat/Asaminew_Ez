const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/comments - public
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM comments ORDER BY date DESC, id DESC');
  res.json(rows);
});

// Basic anti-spam: cap submissions per IP.
const commentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many comments submitted. Try again later.' },
});

// POST /api/comments - public, but rate-limited + honeypot field "website"
// must stay empty (bots tend to fill every field).
router.post('/', commentLimiter, async (req, res) => {
  const { name, location, message, website } = req.body;
  if (website) {
    // Silently accept but don't store — looks successful to a bot, wastes its time.
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

// DELETE /api/comments/:id - admin only (moderation)
router.delete('/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
