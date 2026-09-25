const express = require('express');
const pool = require('../db');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/meetings - any logged-in admin/moderator can view (must be logged in)
router.get('/', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM meetings WHERE scheduled_date >= CURRENT_DATE - INTERVAL \'1 day\' ORDER BY scheduled_date ASC, scheduled_time ASC'
  );
  res.json(rows);
});

// POST /api/meetings - full admin only. Create a meeting.
router.post('/', requireSuperAdmin, async (req, res) => {
  const { title, description, meeting_type, meeting_link, meeting_password, scheduled_date, scheduled_time, organizer } = req.body;
  if (!title || !meeting_type || !meeting_link || !scheduled_date || !scheduled_time) {
    return res.status(400).json({ error: 'title, meeting_type, meeting_link, scheduled_date, scheduled_time required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO meetings (title, description, meeting_type, meeting_link, meeting_password, scheduled_date, scheduled_time, organizer, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [title, description || null, meeting_type, meeting_link, meeting_password || null, scheduled_date, scheduled_time, organizer || null, req.admin.username]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/meetings/:id - full admin only. Edit a meeting.
router.put('/:id', requireSuperAdmin, async (req, res) => {
  const { title, description, meeting_type, meeting_link, meeting_password, scheduled_date, scheduled_time, organizer } = req.body;
  if (!title || !meeting_type || !meeting_link || !scheduled_date || !scheduled_time) {
    return res.status(400).json({ error: 'title, meeting_type, meeting_link, scheduled_date, scheduled_time required' });
  }
  const { rows } = await pool.query(
    `UPDATE meetings SET title=$1, description=$2, meeting_type=$3, meeting_link=$4, meeting_password=$5,
     scheduled_date=$6, scheduled_time=$7, organizer=$8 WHERE id=$9 RETURNING *`,
    [title, description || null, meeting_type, meeting_link, meeting_password || null, scheduled_date, scheduled_time, organizer || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Meeting not found' });
  res.json(rows[0]);
});

// DELETE /api/meetings/:id - full admin only.
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM meetings WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;