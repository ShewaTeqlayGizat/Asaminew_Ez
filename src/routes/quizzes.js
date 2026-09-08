const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { requireStudent } = require('./students');
const router = express.Router();

function requireBootcampAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== 'admin' && req.admin.role !== 'bootcamp_admin') {
      return res.status(403).json({ error: 'Bootcamp admin access required' });
    }
    next();
  });
}

// GET /api/quizzes?course_id=X - list quizzes for a course (public/student)
router.get('/', async (req, res) => {
  const { course_id } = req.query;
  if (!course_id) return res.status(400).json({ error: 'course_id required' });
  const { rows } = await pool.query('SELECT id, course_id, title FROM quizzes WHERE course_id=$1 ORDER BY id ASC', [course_id]);
  res.json(rows);
});

// GET /api/quizzes/:id - quiz with questions (no correct_option revealed to students)
router.get('/:id', requireStudent, async (req, res) => {
  const { rows: quizRows } = await pool.query('SELECT * FROM quizzes WHERE id=$1', [req.params.id]);
  if (!quizRows[0]) return res.status(404).json({ error: 'Quiz not found' });
  const { rows: questions } = await pool.query(
    'SELECT id, question, option_a, option_b, option_c, option_d FROM quiz_questions WHERE quiz_id=$1 ORDER BY id ASC',
    [req.params.id]
  );
  res.json({ ...quizRows[0], questions });
});

// GET /api/quizzes/:id/admin - admin view WITH correct answers (for editing)
router.get('/:id/admin', requireBootcampAdmin, async (req, res) => {
  const { rows: quizRows } = await pool.query('SELECT * FROM quizzes WHERE id=$1', [req.params.id]);
  if (!quizRows[0]) return res.status(404).json({ error: 'Quiz not found' });
  const { rows: questions } = await pool.query('SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY id ASC', [req.params.id]);
  res.json({ ...quizRows[0], questions });
});

// POST /api/quizzes - bootcamp admin only
router.post('/', requireBootcampAdmin, async (req, res) => {
  const { course_id, title } = req.body;
  if (!course_id || !title) return res.status(400).json({ error: 'course_id and title required' });
  const { rows } = await pool.query('INSERT INTO quizzes (course_id, title) VALUES ($1,$2) RETURNING *', [course_id, title]);
  res.status(201).json(rows[0]);
});

// DELETE /api/quizzes/:id - bootcamp admin only
router.delete('/:id', requireBootcampAdmin, async (req, res) => {
  await pool.query('DELETE FROM quizzes WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// POST /api/quizzes/:id/questions - bootcamp admin only
router.post('/:id/questions', requireBootcampAdmin, async (req, res) => {
  const { question, option_a, option_b, option_c, option_d, correct_option } = req.body;
  if (!question || !correct_option) return res.status(400).json({ error: 'question and correct_option required' });
  const { rows } = await pool.query(
    `INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.params.id, question, option_a || null, option_b || null, option_c || null, option_d || null, correct_option.toUpperCase()]
  );
  res.status(201).json(rows[0]);
});

// DELETE /api/quizzes/questions/:qId - bootcamp admin only
router.delete('/questions/:qId', requireBootcampAdmin, async (req, res) => {
  await pool.query('DELETE FROM quiz_questions WHERE id=$1', [req.params.qId]);
  res.status(204).end();
});

// POST /api/quizzes/:id/submit - student only
router.post('/:id/submit', requireStudent, async (req, res) => {
  const { answers } = req.body;
  if (!answers) return res.status(400).json({ error: 'answers required' });
  const { rows: questions } = await pool.query('SELECT id, correct_option FROM quiz_questions WHERE quiz_id=$1', [req.params.id]);
  let score = 0;
  questions.forEach(q => { if ((answers[q.id] || '').toUpperCase() === q.correct_option) score++; });
  const { rows } = await pool.query(
    'INSERT INTO quiz_results (student_id, quiz_id, score, total) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.student.id, req.params.id, score, questions.length]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
