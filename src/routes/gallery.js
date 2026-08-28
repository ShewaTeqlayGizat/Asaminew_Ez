const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { uploadFile } = require('../utils/storage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/gallery?type=photo - public
router.get('/', async (req, res) => {
  const { type } = req.query;
  const params = [];
  let where = '';
  if (type) {
    params.push(type);
    where = 'WHERE type = $1';
  }
  const { rows } = await pool.query(
    `SELECT * FROM gallery_media ${where} ORDER BY created_at DESC`,
    params
  );
  res.json(rows);
});

// POST /api/gallery - admin only.
// For photos, upload a file (field "file"). For videos, pass a "url" (e.g. YouTube embed link).
router.post('/', requireAdmin, upload.single('file'), async (req, res) => {
  const { type, title, url } = req.body;
  const mediaType = type === 'video' ? 'video' : 'photo';

  let finalUrl = url || null;
  if (mediaType === 'photo' && req.file) {
    finalUrl = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'gallery');
  }
  if (!finalUrl) return res.status(400).json({ error: 'file or url required' });

  const { rows } = await pool.query(
    `INSERT INTO gallery_media (type, title, url) VALUES ($1, $2, $3) RETURNING *`,
    [mediaType, title || null, finalUrl]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM gallery_media WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
