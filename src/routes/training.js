const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM training ORDER BY date ASC');
  res.json(rows);
});

router.post('/', requireAdmin, async (req, res) => {
  const { title, date, duration, audience } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'title and date required' });
  const { rows } = await pool.query(
    `INSERT INTO training (title, date, duration, audience) VALUES ($1, $2, $3, $4) RETURNING *`,
    [title, date, duration || null, audience || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { title, date, duration, audience } = req.body;
  const { rows } = await pool.query(
    `UPDATE training SET title = COALESCE($1, title), date = COALESCE($2, date),
     duration = COALESCE($3, duration), audience = COALESCE($4, audience)
     WHERE id = $5 RETURNING *`,
    [title || null, date || null, duration || null, audience || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM training WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
