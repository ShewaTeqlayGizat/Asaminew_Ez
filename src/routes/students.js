const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again later.' },
});

// Middleware: verify student JWT
function requireStudent(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.kind !== 'student') return res.status(401).json({ error: 'Invalid token type' });
    req.student = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// POST /api/students/signup
router.post('/signup', async (req, res) => {
  const { full_name, email, password, phone } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ error: 'full_name, email, password required' });
  const { rows: existing } = await pool.query('SELECT id FROM students WHERE email = $1', [email]);
  if (existing.length) return res.status(409).json({ error: 'That email is already registered' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    'INSERT INTO students (full_name, email, password_hash, phone) VALUES ($1,$2,$3,$4) RETURNING id, full_name, email',
    [full_name, email, hash, phone || null]
  );
  const token = jwt.sign({ id: rows[0].id, email, kind: 'student' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, student: rows[0] });
});

// POST /api/students/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const { rows } = await pool.query('SELECT * FROM students WHERE email = $1', [email]);
  const student = rows[0];
  if (!student) return res.status(401).json({ error: 'Invalid credentials' });

  if (student.locked_until && new Date(student.locked_until) > new Date()) {
    const minsLeft = Math.ceil((new Date(student.locked_until) - new Date()) / 60000);
    return res.status(403).json({ error: `Account locked. Try again in ${minsLeft} minutes.` });
  }

  const valid = await bcrypt.compare(password, student.password_hash);
  if (!valid) {
    const attempts = (student.failed_attempts || 0) + 1;
    if (attempts >= 3) {
      await pool.query(`UPDATE students SET failed_attempts=$1, locked_until = now() + interval '24 hours' WHERE id=$2`, [attempts, student.id]);
      return res.status(403).json({ error: 'Too many failed attempts. Account locked for 24 hours.' });
    }
    await pool.query('UPDATE students SET failed_attempts=$1 WHERE id=$2', [attempts, student.id]);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await pool.query('UPDATE students SET failed_attempts=0, locked_until=NULL WHERE id=$1', [student.id]);
  const token = jwt.sign({ id: student.id, email: student.email, kind: 'student' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, student: { id: student.id, full_name: student.full_name, email: student.email } });
});

// GET /api/students/me - current student profile
router.get('/me', requireStudent, async (req, res) => {
  const { rows } = await pool.query('SELECT id, full_name, email, phone, created_at FROM students WHERE id=$1', [req.student.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

module.exports = { router, requireStudent };
