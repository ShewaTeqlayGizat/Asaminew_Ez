const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Slow down brute-force login attempts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again later.' },
});

// POST /api/auth/login  { username, password } -> { token, role }
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const { rows } = await pool.query(
    'SELECT id, username, password_hash, role FROM admins WHERE username = $1',
    [username]
  );
  const admin = rows[0];
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const role = admin.role || 'admin';
  const token = jwt.sign(
    { id: admin.id, username: admin.username, role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ token, role, username: admin.username });
});

// POST /api/auth/create-admin - full-admin ("manager") only.
// Lets the main manager create additional accounts, including moderators
// who can only view data and moderate comments (no upload/edit/delete).
router.post('/create-admin', requireSuperAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  const finalRole = role === 'moderator' ? 'moderator' : 'admin';

  const { rows: existing } = await pool.query('SELECT id FROM admins WHERE username = $1', [username]);
  if (existing.length) {
    return res.status(409).json({ error: 'That username already exists' });
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    'INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
    [username, hash, finalRole]
  );
  res.status(201).json(rows[0]);
});

// GET /api/auth/admins - full-admin only. Lists all admin accounts (no password hashes).
router.get('/admins', requireSuperAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, role, created_at FROM admins ORDER BY id ASC');
  res.json(rows);
});

// DELETE /api/auth/admins/:id - full-admin only. Removes an admin/moderator account.
router.delete('/admins/:id', requireSuperAdmin, async (req, res) => {
  if (String(req.admin.id) === String(req.params.id)) {
    return res.status(400).json({ error: 'You cannot delete your own account while logged in as it.' });
  }
  await pool.query('DELETE FROM admins WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
