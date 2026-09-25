const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireExecutive, requireOfficeAdmin } = require('./executives');
const { uploadFile } = require('../utils/storage');
const router = express.Router();

// One-time, idempotent migration: adds protocol_number + signature_name to
// assignment_reports if they don't exist yet, and backfills any existing
// reports that lack a protocol number. Runs once when this module loads.
(async () => {
  try {
    await pool.query(`ALTER TABLE assignment_reports ADD COLUMN IF NOT EXISTS protocol_number TEXT`);
    await pool.query(`ALTER TABLE assignment_reports ADD COLUMN IF NOT EXISTS signature_name TEXT`);
    const { rows } = await pool.query(`SELECT id, submitted_at FROM assignment_reports WHERE protocol_number IS NULL`);
    for (const r of rows) {
      const year = new Date(r.submitted_at || Date.now()).getFullYear();
      const protocol = `ስቅ-${year}-${String(r.id).padStart(6, '0')}`;
      await pool.query(`UPDATE assignment_reports SET protocol_number = $1 WHERE id = $2`, [protocol, r.id]);
    }
    if (rows.length) console.log(`assignment_reports: backfilled ${rows.length} protocol number(s).`);
  } catch (err) {
    console.error('assignment_reports migration failed (non-fatal):', err.message);
  }
})();
const uploadPhotos = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).array('photos', 10);

// ---- Assignments ----

// POST /api/assignments - office admin only. Create an assignment for an executive.
router.post('/', requireOfficeAdmin, async (req, res) => {
  const { executive_id, title, description, deadline } = req.body;
  if (!executive_id || !title) return res.status(400).json({ error: 'executive_id and title required' });
  const { rows } = await pool.query(
    'INSERT INTO assignments (executive_id, title, description, deadline, assigned_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [executive_id, title, description || null, deadline || null, req.admin.username]
  );
  res.status(201).json(rows[0]);
});

// GET /api/assignments - office admin only. All assignments (with executive name + report status).
router.get('/', requireOfficeAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, e.full_name as executive_name,
       (SELECT COUNT(*) FROM assignment_reports r WHERE r.assignment_id = a.id) as has_report
     FROM assignments a
     JOIN executives e ON e.id = a.executive_id
     ORDER BY a.created_at DESC`
  );
  res.json(rows);
});

// GET /api/assignments/my - executive only. Their own assignments.
router.get('/my', requireExecutive, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, (SELECT COUNT(*) FROM assignment_reports r WHERE r.assignment_id = a.id) as has_report
     FROM assignments a WHERE a.executive_id = $1 ORDER BY a.created_at DESC`,
    [req.executive.id]
  );
  res.json(rows);
});

// PUT /api/assignments/:id - office admin only. Edit an assignment.
router.put('/:id', requireOfficeAdmin, async (req, res) => {
  const { executive_id, title, description, deadline } = req.body;
  if (!executive_id || !title) return res.status(400).json({ error: 'executive_id and title required' });
  const { rows } = await pool.query(
    'UPDATE assignments SET executive_id=$1, title=$2, description=$3, deadline=$4 WHERE id=$5 RETURNING *',
    [executive_id, title, description || null, deadline || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Assignment not found' });
  res.json(rows[0]);
});

// DELETE /api/assignments/:id - office admin only.
router.delete('/:id', requireOfficeAdmin, async (req, res) => {
  await pool.query('DELETE FROM assignments WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ---- Reports ----

// POST /api/assignments/:id/report - executive only. Submit a structured report + photos.
router.post('/:id/report', requireExecutive, uploadPhotos, async (req, res) => {
  const { achievements, unaccomplished, challenges, solutions_taken,
          swot_strengths, swot_weaknesses, swot_opportunities, swot_threats,
          future_recommendations, findings, signature_name } = req.body;

  if (!signature_name || !signature_name.trim()) {
    return res.status(400).json({ error: 'Signature (full name) is required to submit a report' });
  }

  const { rows: assignRows } = await pool.query('SELECT * FROM assignments WHERE id=$1 AND executive_id=$2', [req.params.id, req.executive.id]);
  if (!assignRows[0]) return res.status(404).json({ error: 'Assignment not found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO assignment_reports
         (assignment_id, executive_id, achievements, unaccomplished, challenges, solutions_taken,
          swot_strengths, swot_weaknesses, swot_opportunities, swot_threats, future_recommendations, findings,
          signature_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.params.id, req.executive.id, achievements || null, unaccomplished || null, challenges || null, solutions_taken || null,
       swot_strengths || null, swot_weaknesses || null, swot_opportunities || null, swot_threats || null,
       future_recommendations || null, findings || null, signature_name.trim()]
    );
    let report = rows[0];

    // Assign the protocol number now that we have the row's id.
    const year = new Date(report.submitted_at || Date.now()).getFullYear();
    const protocol_number = `ስቅ-${year}-${String(report.id).padStart(6, '0')}`;
    const { rows: updated } = await client.query(
      `UPDATE assignment_reports SET protocol_number = $1 WHERE id = $2 RETURNING *`,
      [protocol_number, report.id]
    );
    report = updated[0];

    if (req.files && req.files.length) {
      for (const file of req.files) {
        const file_url = await uploadFile(file.buffer, file.originalname, file.mimetype, 'reports');
        await client.query('INSERT INTO report_attachments (report_id, file_url) VALUES ($1,$2)', [report.id, file_url]);
      }
    }

    await client.query('UPDATE assignments SET status = $1 WHERE id = $2', ['reported', req.params.id]);
    await client.query('COMMIT');
    res.status(201).json(report);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Report submission failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

const jwt = require('jsonwebtoken');

// GET /api/assignments/:id/report - office admin OR the owning executive. View a report with attachments.
router.get('/:id/report', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { rows: assignRows } = await pool.query('SELECT * FROM assignments WHERE id=$1', [req.params.id]);
  if (!assignRows[0]) return res.status(404).json({ error: 'Assignment not found' });

  const isOfficeAdmin = ['admin', 'moderator', 'office_admin'].includes(payload.role);
  const isOwningExecutive = payload.kind === 'executive' && payload.id === assignRows[0].executive_id;
  if (!isOfficeAdmin && !isOwningExecutive) return res.status(403).json({ error: 'Not allowed' });

  const { rows: reportRows } = await pool.query('SELECT * FROM assignment_reports WHERE assignment_id=$1', [req.params.id]);
  if (!reportRows[0]) return res.status(404).json({ error: 'No report yet' });
  const { rows: attachments } = await pool.query('SELECT * FROM report_attachments WHERE report_id=$1', [reportRows[0].id]);
  res.json({ ...reportRows[0], attachments });
});

module.exports = router;