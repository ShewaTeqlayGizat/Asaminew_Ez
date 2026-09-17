const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again later.' },
});

function requireOfficeAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== 'admin' && req.admin.role !== 'office_admin') {
      return res.status(403).json({ error: 'Office admin access required' });
    }
    next();
  });
}

function requireExecutive(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.kind !== 'executive') return res.status(401).json({ error: 'Invalid token type' });
    req.executive = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// POST /api/executives/admin-create - office admin only. Register an executive.
router.post('/admin-create', requireOfficeAdmin, async (req, res) => {
  const { full_name, position, phone, email, password } = req.body;
  if (!full_name || !password) return res.status(400).json({ error: 'full_name and password required' });
  const { rows: existing } = await pool.query('SELECT id FROM executives WHERE full_name = $1', [full_name]);
  if (existing.length) return res.status(409).json({ error: 'That name is already registered' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    'INSERT INTO executives (full_name, position, phone, email, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id, full_name, position',
    [full_name, position || null, phone || null, email || null, hash]
  );
  res.status(201).json({ executive: rows[0] });
});

// GET /api/executives - office admin only. List all executives.
router.get('/', requireOfficeAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id, full_name, position, phone, email FROM executives ORDER BY full_name ASC');
  res.json(rows);
});

// POST /api/executives/login - by full_name + password
router.post('/login', loginLimiter, async (req, res) => {
  const { full_name, password } = req.body;
  if (!full_name || !password) return res.status(400).json({ error: 'full_name and password required' });
  const { rows } = await pool.query('SELECT * FROM executives WHERE full_name = $1', [full_name]);
  const exec = rows[0];
  if (!exec) return res.status(401).json({ error: 'Invalid credentials' });

  if (exec.locked_until && new Date(exec.locked_until) > new Date()) {
    const minsLeft = Math.ceil((new Date(exec.locked_until) - new Date()) / 60000);
    return res.status(403).json({ error: `Account locked. Try again in ${minsLeft} minutes.` });
  }

  const valid = await bcrypt.compare(password, exec.password_hash);
  if (!valid) {
    const attempts = (exec.failed_attempts || 0) + 1;
    if (attempts >= 3) {
      await pool.query(`UPDATE executives SET failed_attempts=$1, locked_until = now() + interval '24 hours' WHERE id=$2`, [attempts, exec.id]);
      return res.status(403).json({ error: 'Too many failed attempts. Account locked for 24 hours.' });
    }
    await pool.query('UPDATE executives SET failed_attempts=$1 WHERE id=$2', [attempts, exec.id]);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await pool.query('UPDATE executives SET failed_attempts=0, locked_until=NULL WHERE id=$1', [exec.id]);
  const token = jwt.sign({ id: exec.id, full_name: exec.full_name, kind: 'executive' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, executive: { id: exec.id, full_name: exec.full_name, position: exec.position } });
});

module.exports = { router, requireExecutive, requireOfficeAdmin };