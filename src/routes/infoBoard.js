const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');
const { uploadFile } = require('../utils/storage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// GET /api/info-board - public (viewing stays open to everyone)
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM info_board_posts ORDER BY date DESC, id DESC');
  res.json(rows);
});

// POST /api/info-board - ADMIN ONLY.
// This is the route that used to be wide open to any visitor in the old
// localStorage version. Locking it down is the main security fix here.
router.post('/', requireSuperAdmin, upload.single('file'), async (req, res) => {
  try {
    const { title, type, content } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    if (type === 'pdf') {
      if (!req.file) return res.status(400).json({ error: 'PDF file required' });
      const file_url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'info-board');
      const { rows } = await pool.query(
        `INSERT INTO info_board_posts (title, type, file_url) VALUES ($1, 'pdf', $2) RETURNING *`,
        [title, file_url]
      );
      return res.status(201).json(rows[0]);
    }

    if (!content) return res.status(400).json({ error: 'content required for text posts' });
    const { rows } = await pool.query(
      `INSERT INTO info_board_posts (title, type, content) VALUES ($1, 'text', $2) RETURNING *`,
      [title, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Info board post failed:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// DELETE /api/info-board/:id - ADMIN ONLY (was previously open to anyone)
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM info_board_posts WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
