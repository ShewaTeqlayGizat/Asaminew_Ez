const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { requireStudent } = require('./students');
const { uploadFile } = require('../utils/storage');
const router = express.Router();

const uploadCourseFiles = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
  .fields([{ name: 'logo', maxCount: 1 }, { name: 'stamp', maxCount: 1 }, { name: 'signature', maxCount: 1 }, { name: 'signature2', maxCount: 1 }]);

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

// POST /api/courses - full admin only
router.post('/', requireSuperAdmin, uploadCourseFiles, async (req, res) => {
  const { title, description, instructor, cover_url, signature2_name } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  let logo_url = null, stamp_url = null, signature_url = null, signature2_url = null;
  if (req.files?.logo?.[0]) {
    const f = req.files.logo[0];
    logo_url = await uploadFile(f.buffer, f.originalname, f.mimetype, 'courses');
  }
  if (req.files?.stamp?.[0]) {
    const f = req.files.stamp[0];
    stamp_url = await uploadFile(f.buffer, f.originalname, f.mimetype, 'courses');
  }
  if (req.files?.signature?.[0]) {
    const f = req.files.signature[0];
    signature_url = await uploadFile(f.buffer, f.originalname, f.mimetype, 'courses');
  }
  if (req.files?.signature2?.[0]) {
    const f = req.files.signature2[0];
    signature2_url = await uploadFile(f.buffer, f.originalname, f.mimetype, 'courses');
  }
  const { rows } = await pool.query(
    'INSERT INTO courses (title, description, instructor, cover_url, logo_url, stamp_url, signature_url, signature2_name, signature2_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [title, description || null, instructor || null, cover_url || null, logo_url, stamp_url, signature_url, signature2_name || null, signature2_url]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/courses/:id - full admin only
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

// DELETE /api/courses/:id - full admin only
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM courses WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ---- Lessons (video) ----

const uploadLessonFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }).single('file');

router.post('/:id/lessons', requireSuperAdmin, uploadLessonFile, async (req, res) => {
  const { title, video_url, position, lesson_type } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const type = lesson_type || 'video_url';
  if (type === 'video_url' && !video_url) return res.status(400).json({ error: 'video_url required for this type' });
  if ((type === 'video' || type === 'pdf' || type === 'audio') && !req.file) return res.status(400).json({ error: 'file required for this type' });

  let file_url = null;
  if (req.file) {
    file_url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'lessons');
  }
  const { rows } = await pool.query(
    'INSERT INTO lessons (course_id, title, video_url, file_url, lesson_type, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.params.id, title, video_url || null, file_url, type, position || 0]
  );
  res.status(201).json(rows[0]);
});

router.put('/lessons/:lessonId', requireSuperAdmin, async (req, res) => {
  const { title, video_url, position } = req.body;
  const { rows } = await pool.query(
    `UPDATE lessons SET title=COALESCE($1,title), video_url=COALESCE($2,video_url), position=COALESCE($3,position) WHERE id=$4 RETURNING *`,
    [title || null, video_url || null, position || null, req.params.lessonId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/lessons/:lessonId', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM lessons WHERE id=$1', [req.params.lessonId]);
  res.status(204).end();
});

// ---- Enrollment (student joins a course) ----

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

router.get('/my/enrolled', requireStudent, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.* FROM courses c JOIN enrollments e ON e.course_id = c.id WHERE e.student_id = $1`,
    [req.student.id]
  );
  res.json(rows);
});

router.post('/lessons/:lessonId/complete', requireStudent, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO lesson_progress (student_id, lesson_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.student.id, req.params.lessonId]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
