const express = require('express');
const pool = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');
const { requireStudent } = require('./students');
const router = express.Router();

// GET /api/courses - public list (student portal + landing page)
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM courses ORDER BY id DESC');
  res.json(rows);
});

// GET /api/courses/:id - single course with its lessons
router.get('/:id', async (req, res) => {
  const { rows: courseRows } = await pool.query('SELECT * FROM courses WHERE id=$1', [req.params.id]);
  if (!courseRows[0]) return res.status(404).json({ error: 'Course not found' });
  const { rows: lessons } = await pool.query('SELECT * FROM lessons WHERE course_id=$1 ORDER BY position ASC, id ASC', [req.params.id]);
  res.json({ ...courseRows[0], lessons });
});

// POST /api/courses - admin (main manager) only
router.post('/', requireSuperAdmin, async (req, res) => {
  const { title, description, instructor, cover_url } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const { rows } = await pool.query(
    'INSERT INTO courses (title, description, instructor, cover_url) VALUES ($1,$2,$3,$4) RETURNING *',
    [title, description || null, instructor || null, cover_url || null]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/courses/:id - admin only
router.put('/:id', requireSuperAdmin, async (req, res) => {
  const { title, description, instructor, cover_url } = req.body;
  const { rows } = await pool.query(
    `UPDATE courses SET title=COALESCE($1,title), description=COALESCE($2,description),
     instructor=COALESCE($3,instructor), cover_url=COALESCE($4,cover_url) WHERE id=$5 RETURNING *`,
    [title || null, description || null, instructor || null, cover_url || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// DELETE /api/courses/:id - admin only
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM courses WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ---- Lessons (video) ----

// POST /api/courses/:id/lessons - admin only. Add a video lesson to a course.
router.post('/:id/lessons', requireSuperAdmin, async (req, res) => {
  const { title, video_url, position } = req.body;
  if (!title || !video_url) return res.status(400).json({ error: 'title and video_url required' });
  const { rows } = await pool.query(
    'INSERT INTO lessons (course_id, title, video_url, position) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id, title, video_url, position || 0]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/courses/lessons/:lessonId - admin only
router.put('/lessons/:lessonId', requireSuperAdmin, async (req, res) => {
  const { title, video_url, position } = req.body;
  const { rows } = await pool.query(
    `UPDATE lessons SET title=COALESCE($1,title), video_url=COALESCE($2,video_url), position=COALESCE($3,position) WHERE id=$4 RETURNING *`,
    [title || null, video_url || null, position || null, req.params.lessonId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// DELETE /api/courses/lessons/:lessonId - admin only
router.delete('/lessons/:lessonId', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM lessons WHERE id=$1', [req.params.lessonId]);
  res.status(204).end();
});

// ---- Enrollment (student joins a course) ----

// POST /api/courses/:id/enroll - student only
router.post('/:id/enroll', requireStudent, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'INSERT INTO enrollments (student_id, course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *',
      [req.student.id, req.params.id]
    );
    res.status(201).json(rows[0] || { ok: true, already: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/courses/my/enrolled - student only. List courses this student joined.
router.get('/my/enrolled', requireStudent, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.* FROM courses c JOIN enrollments e ON e.course_id = c.id WHERE e.student_id = $1`,
    [req.student.id]
  );
  res.json(rows);
});

module.exports = router;
