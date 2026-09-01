const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { uploadFile } = require('../utils/storage');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function requireCanCreateMembers(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== 'admin' && req.admin.role !== 'registrar') {
      return res.status(403).json({ error: 'Not allowed to add members' });
    }
    next();
  });
}

router.get('/', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM member_registrations ORDER BY id DESC');
  res.json(rows);
});

router.post('/', requireCanCreateMembers, upload.single('photo'), async (req, res) => {
  try {
    const { name, gender, age, birthplace, reg_id, join_date, marital, role, education, skill, status, bio } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    let photo_url = null;
    if (req.file) {
      photo_url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'members');
    }
    const { rows } = await pool.query(
      `INSERT INTO member_registrations
         (name, photo_url, gender, age, birthplace, reg_id, join_date, marital, role, education, skill, status, bio)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,'አሁንም በሥራ ላይ ነው'),$13) RETURNING *`,
      [name, photo_url, gender || null, age || null, birthplace || null, reg_id || null,
       join_date || null, marital || null, role || null, education || null, skill || null,
       status || null, bio || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Member registration failed:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

router.put('/:id', requireSuperAdmin, async (req, res) => {
  const { name, gender, age, birthplace, reg_id, join_date, marital, role, education, skill, status, bio } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await pool.query(
      `UPDATE member_registrations SET
         name=$1, gender=$2, age=$3, birthplace=$4, reg_id=$5, join_date=$6,
         marital=$7, role=$8, education=$9, skill=$10, status=$11, bio=$12
       WHERE id=$13 RETURNING *`,
      [name, gender || null, age || null, birthplace || null, reg_id || null,
       join_date || null, marital || null, role || null, education || null, skill || null,
       status || null, bio || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Member not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Member update failed:', err);
    res.status(500).json({ error: 'Update failed: ' + err.message });
  }
});

router.delete('/:id', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM member_registrations WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
