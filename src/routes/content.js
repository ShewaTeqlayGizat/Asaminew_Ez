const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { uploadFile } = require('../utils/storage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const VALID_TYPES = [
  'library', 'eduText', 'eduPdf', 'eduPpt',
  'entVideo', 'entAudio', 'entLit', 'entCulture',
  'topicBoardArticle', 'topicBoardInfo',
  'channelVideo',
];

// GET /api/content?type=eduPdf&topic=agriculture - public
// Replaces DATA.library / DATA.eduText / DATA.eduPdf / DATA.eduPpt /
// DATA.entVideo / DATA.entAudio / DATA.entLit / DATA.entCulture /
// DATA.topicBoards[key] in the original frontend.
router.get('/', async (req, res) => {
  const { type, topic } = req.query;
  const conditions = [];
  const params = [];

  if (type) {
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  if (topic) {
    params.push(topic);
    conditions.push(`topic_key = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM content_items ${where} ORDER BY date DESC, id DESC`,
    params
  );
  res.json(rows);
});

// POST /api/content - admin only. Accepts optional file upload (field name "file").
router.post('/', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { type, topic_key, title, author, category, body, pages, date } = req.body;
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'valid type required' });
    }
    if (!title) return res.status(400).json({ error: 'title required' });

    let file_url = null;
    if (req.file) {
      file_url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, type);
    }

    const { rows } = await pool.query(
      `INSERT INTO content_items (type, topic_key, title, author, category, body, file_url, pages, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9, CURRENT_DATE)) RETURNING *`,
      [type, topic_key || null, title, author || null, category || null, body || null, file_url, pages || null, date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Content upload failed:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM content_items WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
