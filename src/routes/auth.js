const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again later.' },
});

const MAX_ATTEMPTS = 3;
const LOCK_HOURS = 24;

// POST /api/auth/login  { username, password } -> { token, role }
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  const { rows } = await pool.query(
    'SELECT id, username, password_hash, role, failed_attempts, locked_until FROM admins WHERE username = $1',
    [username]
  );
  const admin = rows[0];
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    const minsLeft = Math.ceil((new Date(admin.locked_until) - new Date()) / 60000);
    return res.status(403).json({ error: `Account locked. Try again in ${minsLeft} minutes.` });
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    const attempts = (admin.failed_attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await pool.query(
        `UPDATE admins SET failed_attempts = $1, locked_until = now() + interval '${LOCK_HOURS} hours' WHERE id = $2`,
        [attempts, admin.id]
      );
      return res.status(403).json({ error: `Too many failed attempts. Account locked for ${LOCK_HOURS} hours.` });
    }
    await pool.query('UPDATE admins SET failed_attempts = $1 WHERE id = $2', [attempts, admin.id]);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Successful login: reset attempts/lock
  await pool.query('UPDATE admins SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [admin.id]);

  const role = admin.role || 'admin';
  const token = jwt.sign(
    { id: admin.id, username: admin.username, role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, role, username: admin.username });
});

// POST /api/auth/create-admin - full-admin only.
router.post('/create-admin', requireSuperAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
 const allowedRoles = ['admin', 'moderator', 'registrar'];
  const finalRole = allowedRoles.includes(role) ? role : 'admin';
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

// GET /api/auth/admins - full-admin only.
router.get('/admins', requireSuperAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, role, created_at, failed_attempts, locked_until FROM admins ORDER BY id ASC'
  );
  res.json(rows);
});

// PUT /api/auth/admins/:id/password - full-admin only. Reset a password.
router.put('/admins/:id/password', requireSuperAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'password required' });
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'UPDATE admins SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE id = $2',
    [hash, req.params.id]
  );
  res.json({ ok: true });
});

// PUT /api/auth/admins/:id/unlock - full-admin only. Manually unlock a locked account.
router.put('/admins/:id/unlock', requireSuperAdmin, async (req, res) => {
  await pool.query('UPDATE admins SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// DELETE /api/auth/admins/:id - full-admin only.
router.delete('/admins/:id', requireSuperAdmin, async (req, res) => {
  if (String(req.admin.id) === String(req.params.id)) {
    return res.status(400).json({ error: 'You cannot delete your own account while logged in as it.' });
  }
  await pool.query('DELETE FROM admins WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
