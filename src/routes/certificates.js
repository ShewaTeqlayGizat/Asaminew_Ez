const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');
const { requireStudent } = require('./students');
const router = express.Router();

// GET /api/certificates/my - student's own certificates
router.get('/my', requireStudent, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cert.*, c.title as course_title FROM certificates cert
     JOIN courses c ON c.id = cert.course_id
     WHERE cert.student_id = $1 ORDER BY cert.issued_at DESC`,
    [req.student.id]
  );
  res.json(rows);
});

// GET /api/certificates/verify/:code - public verification
router.get('/verify/:code', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cert.certificate_code, cert.issued_at, c.title as course_title, c.logo_url, c.stamp_url, c.signature_url, c.signature2_name, c.signature2_url, s.full_name
     FROM certificates cert
     JOIN courses c ON c.id = cert.course_id
     JOIN students s ON s.id = cert.student_id
     WHERE cert.certificate_code = $1`,
    [req.params.code]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Certificate not found' });
  res.json(rows[0]);
});

// POST /api/certificates/issue - full admin only
router.post('/issue', requireSuperAdmin, async (req, res) => {
  const { student_id, course_id } = req.body;
  if (!student_id || !course_id) return res.status(400).json({ error: 'student_id and course_id required' });
  const code = crypto.randomBytes(6).toString('hex').toUpperCase();
  try {
    const { rows } = await pool.query(
      'INSERT INTO certificates (student_id, course_id, certificate_code) VALUES ($1,$2,$3) RETURNING *',
      [student_id, course_id, code]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/certificates/eligible-students?course_id=X - full admin only
router.get('/eligible-students', requireSuperAdmin, async (req, res) => {
  const { course_id } = req.query;
  if (!course_id) return res.status(400).json({ error: 'course_id required' });
  const { rows } = await pool.query(
    `SELECT s.id, s.full_name, s.email, s.photo_url FROM students s
     JOIN enrollments e ON e.student_id = s.id
     WHERE e.course_id = $1
     AND s.id NOT IN (SELECT student_id FROM certificates WHERE course_id = $1)`,
    [course_id]
  );
  res.json(rows);
});

module.exports = router;
