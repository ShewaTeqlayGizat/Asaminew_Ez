const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { uploadFile } = require('../utils/storage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// This whole resource is admin-only, unlike the public content routes —
// it holds personal data (birthplace, marital status, etc.) about members,
// not public-facing site content, so even GET requires a login.

router.get('/', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM member_registrations ORDER BY id DESC');
  res.json(rows);
});

router.post('/', requireAdmin, upload.single('photo'), async (req, res) => {
  const { name, gender, age, birthplace, reg_id, join_date, marital, role, education, skill, status, bio } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  let photo_url = null;
  if (req.file) {
    photo_url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'members');
  }

  const { rows } = await pool.query(
    `INSERT INTO member_registrations
       (name, photo_url, gender, age, birthplace, reg_id, join_date, marital, role, education, skill, status, bio)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,'ንቁ'),$13) RETURNING *`,
    [name, photo_url, gender || null, age || null, birthplace || null, reg_id || null,
     join_date || null, marital || null, role || null, education || null, skill || null,
     status || null, bio || null]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM member_registrations WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
