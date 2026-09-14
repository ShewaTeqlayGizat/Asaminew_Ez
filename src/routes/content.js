const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/content - Public access to fetch all content items
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM content ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Fetch content error:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// GET /api/content/:id - Public access to fetch a single content item
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM content WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Fetch single content error:', err);
    res.status(500).json({ error: 'Failed to fetch content item' });
  }
});

// POST /api/content - Admin only: Create content
router.post('/', requireAdmin, async (req, res) => {
  const { title, body, category, image_url } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO content (title, body, category, image_url, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, body, category || null, image_url || null, req.admin?.username || 'admin']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create content error:', err);
    res.status(500).json({ error: 'Failed to create content' });
  }
});

// PUT /api/content/:id - Admin only: Update content
router.put('/:id', requireAdmin, async (req, res) => {
  const { title, body, category, image_url } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE content 
       SET title = COALESCE($1, title),
           body = COALESCE($2, body),
           category = COALESCE($3, category),
           image_url = COALESCE($4, image_url),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING *`,
      [title, body, category, image_url, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Update content error:', err);
    res.status(500).json({ error: 'Failed to update content' });
  }
});

// DELETE /api/content/:id - Admin only: Delete content
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM content WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.status(204).end();
  } catch (err) {
    console.error('Delete content error:', err);
    res.status(500).json({ error: 'Failed to delete content' });
  }
});

module.exports = router;