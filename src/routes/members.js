const express = require('express');
const pool = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/members - public, sorted by rank (1 = chairman, etc.)
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM members ORDER BY rank ASC, id ASC');
  res.json(rows);
});

// POST /api/members - admin only
router.post('/', requireSuperAdmin, async (req, res) => {
  const { name, role, department, rank, photo_url } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'name and role required' });
  const { rows } = await pool.query(
    `INSERT INTO members (name, role, department, rank, photo_url)
     VALUES ($1, $2, $3, COALESCE($4, 99), $5) RETURNING *`,
    [name, role, department || null, rank || null, photo_url || null]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/members/:id - admin only
router.put('/:id', requireSuperAdmin, async (req, res) => {
  const { name, role, department, rank, photo_url } = req.body;
  const { rows } = await pool.query(
    `UPDATE members SET
       name = COALESCE($1, name),
       role = COALESCE($2, role),
       department = COALESCE($3, department),
       rank = COALESCE($4, rank),
       photo_url = COALESCE($5, photo_url)
     WHERE id = $6 RETURNING *`,
    [name || null, role || null, department || null, rank || null, photo_url || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// DELETE /api/members/:id - admin only
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM members WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
