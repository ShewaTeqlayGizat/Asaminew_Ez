const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');
const { uploadFile } = require('../utils/storage');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const VALID_TYPES = [
  'library', 'eduPdf', 'eduPpt', 'eduVideo', 'eduText',
  'gazettePdf', 'gazetteText', 'entVideo', 'entCulture',
  'channelVideo', 'liveBroadcast'
];

// GET /api/content?type=xxx - public
router.get('/', async (req, res) => {
  const { type } = req.query;
  let rows;
  if (type) {
    ({ rows } = await pool.query('SELECT * FROM content_items WHERE type = $1 ORDER BY date DESC, id DESC', [type]));
  } else {
    ({ rows } = await pool.query('SELECT * FROM content_items ORDER BY date DESC, id DESC'));
  }
  res.json(rows);
});

// POST /api/content - admin only. Optional file upload ("file"), or a URL body field for videos.
router.post('/', requireSuperAdmin, upload.single('file'), async (req, res) => {
  try {
    const { type, title, author, category, body, date, pages, url, topic_key } = req.body;
    if (!type || !VALID_TYPES.includes(type)) return res.status(400).json({ error: 'valid type required' });
    if (!title) return res.status(400).json({ error: 'title required' });
    let file_url = url || null;
    if (req.file) {
      file_url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'content');
    }
    const { rows } = await pool.query(
      `INSERT INTO content_items (type, topic_key, title, author, category, body, file_url, pages, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, CURRENT_DATE)) RETURNING *`,
      [type, topic_key || null, title, author || null, category || null, body || null, file_url, pages || null, date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Content post failed:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// PUT /api/content/:id - admin only
router.put('/:id', requireSuperAdmin, upload.single('file'), async (req, res) => {
  try {
    const { title, author, category, body, date, pages, url } = req.body;
    let file_url = url || null;
    if (req.file) {
      file_url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'content');
    }
    const { rows } = await pool.query(
      `UPDATE content_items SET title = COALESCE($1, title), author = COALESCE($2, author),
       category = COALESCE($3, category), body = COALESCE($4, body),
       file_url = COALESCE($5, file_url), pages = COALESCE($6, pages), date = COALESCE($7, date)
       WHERE id = $8 RETURNING *`,
      [title || null, author || null, category || null, body || null, file_url, pages || null, date || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Content update failed:', err);
    res.status(500).json({ error: 'Update failed: ' + err.message });
  }
});

// DELETE /api/content/:id - admin only
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM content_items WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
