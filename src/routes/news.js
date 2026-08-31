const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');
const { uploadFile } = require('../utils/storage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// GET /api/news - public
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM news ORDER BY date DESC, id DESC');
  res.json(rows);
});

// POST /api/news - admin only. Optional file field "image" (photo or PDF), optional "video_url" text field.
router.post('/', requireSuperAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, body, date, video_url } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    let file_url = null;
    if (req.file) {
      file_url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'news');
    }

    const { rows } = await pool.query(
      `INSERT INTO news (title, body, file_url, video_url, date) VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE)) RETURNING *`,
      [title, body || null, file_url, video_url || null, date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('News post failed:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// PUT /api/news/:id - admin only
router.put('/:id', requireSuperAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, body, date, video_url } = req.body;
    let file_url = null;
    if (req.file) {
      file_url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'news');
    }
    const { rows } = await pool.query(
      `UPDATE news SET title = COALESCE($1, title), body = COALESCE($2, body),
       file_url = COALESCE($3, file_url), video_url = COALESCE($4, video_url), date = COALESCE($5, date) WHERE id = $6 RETURNING *`,
      [title || null, body || null, file_url, video_url || null, date || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('News update failed:', err);
    res.status(500).json({ error: 'Update failed: ' + err.message });
  }
});

// DELETE /api/news/:id - admin only
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM news WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
