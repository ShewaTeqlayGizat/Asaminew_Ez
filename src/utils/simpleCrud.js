const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

/**
 * Builds a router with standard GET (public) / POST / PUT / DELETE (admin)
 * routes for a simple table shaped like: id, title, body, date.
 * Used for news, announcements, and urgent_notices — they're structurally
 * identical, so one factory avoids three copy-pasted route files.
 */
function simpleCrudRouter(tableName) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM ${tableName} ORDER BY date DESC, id DESC`
    );
    res.json(rows);
  });

  router.post('/', requireAdmin, async (req, res) => {
    const { title, body, date } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const { rows } = await pool.query(
      `INSERT INTO ${tableName} (title, body, date) VALUES ($1, $2, COALESCE($3, CURRENT_DATE)) RETURNING *`,
      [title, body || null, date || null]
    );
    res.status(201).json(rows[0]);
  });

  router.put('/:id', requireAdmin, async (req, res) => {
    const { title, body, date } = req.body;
    const { rows } = await pool.query(
      `UPDATE ${tableName} SET title = COALESCE($1, title), body = COALESCE($2, body),
       date = COALESCE($3, date) WHERE id = $4 RETURNING *`,
      [title || null, body || null, date || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  });

  router.delete('/:id', requireAdmin, async (req, res) => {
    await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  });

  return router;
}

module.exports = { simpleCrudRouter };
