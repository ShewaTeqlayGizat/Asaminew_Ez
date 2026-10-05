const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// One-time, idempotent setup: instructors table + courses.instructor_id link.
(async () => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS instructors (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      password_hash TEXT NOT NULL,
      failed_attempts INT DEFAULT 0,
      locked_until TIMESTAMP,
      created_at TIMESTAMP DEFAULT now()
    )`);
    await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS instructor_id INTEGER REFERENCES instructors(id) ON DELETE SET NULL`);
  } catch (err) {
    console.error('instructors setup failed (non-fatal):', err.message);
  }
})();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again later.' },
});

function requireInstructorManager(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== 'admin' && req.admin.role !== 'bootcamp_admin') {
      return res.status(403).json({ error: 'Bootcamp admin access required' });
    }
    next();
  });
}

function requireInstructor(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.kind !== 'instructor') return res.status(401).json({ error: 'Invalid token type' });
    req.instructor = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Shared across courses.js / quizzes.js / certificates.js: allows an admin
// (or bootcamp_admin) through unconditionally, and an instructor only if
// they own the course resolved by resolveCourseId(req).
function requireCourseAccess(resolveCourseId) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing auth token' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (payload.kind === 'instructor') {
      try {
        const courseId = await resolveCourseId(req);
        if (!courseId) return res.status(404).json({ error: 'Course not found' });
        const { rows } = await pool.query('SELECT instructor_id FROM courses WHERE id=$1', [courseId]);
        if (!rows[0] || rows[0].instructor_id !== payload.id) {
          return res.status(403).json({ error: 'Not your course' });
        }
        req.instructor = payload;
        return next();
      } catch (err) {
        console.error('Course access check failed:', err);
        return res.status(500).json({ error: 'Access check failed' });
      }
    }

    if (payload.role === 'admin' || payload.role === 'bootcamp_admin') {
      req.admin = payload;
      return next();
    }
    return res.status(403).json({ error: 'Not allowed' });
  };
}

// POST /api/instructors/admin-create - bootcamp admin / full admin only.
router.post('/admin-create', requireInstructorManager, async (req, res) => {
  const { full_name, email, phone, password } = req.body;
  if (!full_name || !password) return res.status(400).json({ error: 'full_name and password required' });
  const { rows: existing } = await pool.query('SELECT id FROM instructors WHERE full_name = $1', [full_name]);
  if (existing.length) return res.status(409).json({ error: 'That name is already registered' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    'INSERT INTO instructors (full_name, email, phone, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, full_name, email, phone',
    [full_name, email || null, phone || null, hash]
  );
  res.status(201).json({ instructor: rows[0] });
});

// GET /api/instructors - bootcamp admin / full admin only. With assigned course titles.
router.get('/', requireInstructorManager, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.id, i.full_name, i.email, i.phone,
       (SELECT json_agg(json_build_object('id', c.id, 'title', c.title)) FROM courses c WHERE c.instructor_id = i.id) as courses
     FROM instructors i ORDER BY i.full_name ASC`
  );
  res.json(rows);
});

// PUT /api/instructors/:id - bootcamp admin / full admin only.
router.put('/:id', requireInstructorManager, async (req, res) => {
  const { full_name, email, phone } = req.body;
  if (!full_name) return res.status(400).json({ error: 'full_name required' });
  const { rows } = await pool.query(
    'UPDATE instructors SET full_name=$1, email=$2, phone=$3 WHERE id=$4 RETURNING id, full_name, email, phone',
    [full_name, email || null, phone || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Instructor not found' });
  res.json(rows[0]);
});

// DELETE /api/instructors/:id - bootcamp admin / full admin only.
router.delete('/:id', requireInstructorManager, async (req, res) => {
  await pool.query('DELETE FROM instructors WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// POST /api/instructors/login - by full_name + password
router.post('/login', loginLimiter, async (req, res) => {
  const { full_name, password } = req.body;
  if (!full_name || !password) return res.status(400).json({ error: 'full_name and password required' });
  const { rows } = await pool.query('SELECT * FROM instructors WHERE full_name = $1', [full_name]);
  const instructor = rows[0];
  if (!instructor) return res.status(401).json({ error: 'Invalid credentials' });

  if (instructor.locked_until && new Date(instructor.locked_until) > new Date()) {
    const minsLeft = Math.ceil((new Date(instructor.locked_until) - new Date()) / 60000);
    return res.status(403).json({ error: `Account locked. Try again in ${minsLeft} minutes.` });
  }

  const valid = await bcrypt.compare(password, instructor.password_hash);
  if (!valid) {
    const attempts = (instructor.failed_attempts || 0) + 1;
    if (attempts >= 3) {
      await pool.query(`UPDATE instructors SET failed_attempts=$1, locked_until = now() + interval '24 hours' WHERE id=$2`, [attempts, instructor.id]);
      return res.status(403).json({ error: 'Too many failed attempts. Account locked for 24 hours.' });
    }
    await pool.query('UPDATE instructors SET failed_attempts=$1 WHERE id=$2', [attempts, instructor.id]);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await pool.query('UPDATE instructors SET failed_attempts=0, locked_until=NULL WHERE id=$1', [instructor.id]);
  const token = jwt.sign({ id: instructor.id, full_name: instructor.full_name, kind: 'instructor' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, instructor: { id: instructor.id, full_name: instructor.full_name } });
});

// GET /api/instructors/my-courses - instructor only. Courses assigned to them.
router.get('/my-courses', requireInstructor, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM courses WHERE instructor_id=$1 ORDER BY id DESC', [req.instructor.id]);
  res.json(rows);
});

module.exports = { router, requireInstructor, requireInstructorManager, requireCourseAccess };
