const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { uploadFile } = require('../utils/storage');
const router = express.Router();

const uploadReceiptFiles = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
  .fields([{ name: 'receipt', maxCount: 1 }, { name: 'signature', maxCount: 1 }]);

function requireFinanceAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== 'admin' && req.admin.role !== 'finance_admin') {
      return res.status(403).json({ error: 'Finance admin access required' });
    }
    next();
  });
}

// GET /api/finance/accounts - finance admin only. List chart of accounts.
router.get('/accounts', requireFinanceAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM chart_of_accounts ORDER BY code ASC');
  res.json(rows);
});

// POST /api/finance/entries - finance admin only. Record a double-entry transaction.
// body: { entry_date, description, reason, payment_method, bank_reference, payee_id, debit_account_id, credit_account_id, amount }
router.post('/entries', requireFinanceAdmin, uploadReceiptFiles, async (req, res) => {
  const { entry_date, description, reason, payment_method, bank_reference, payee_id, debit_account_id, credit_account_id, amount } = req.body;
  if (!description || !debit_account_id || !credit_account_id || !amount) {
    return res.status(400).json({ error: 'description, debit_account_id, credit_account_id, amount required' });
  }
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  let receipt_url = null, signature_url = null;
  if (req.files?.receipt?.[0]) {
    const f = req.files.receipt[0];
    receipt_url = await uploadFile(f.buffer, f.originalname, f.mimetype, 'finance');
  }
  if (req.files?.signature?.[0]) {
    const f = req.files.signature[0];
    signature_url = await uploadFile(f.buffer, f.originalname, f.mimetype, 'finance');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: entryRows } = await client.query(
      `INSERT INTO journal_entries (entry_date, description, reason, payment_method, bank_reference, payee_id, receipt_url, signature_url, created_by)
       VALUES (COALESCE($1, CURRENT_DATE), $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [entry_date || null, description, reason || null, payment_method || null, bank_reference || null,
       payee_id || null, receipt_url, signature_url, req.admin.username]
    );
    const entry = entryRows[0];

    // Double-entry: one debit line, one credit line, equal amounts (balanced by construction).
    await client.query(
      'INSERT INTO journal_lines (entry_id, account_id, debit, credit) VALUES ($1,$2,$3,0)',
      [entry.id, debit_account_id, amt]
    );
    await client.query(
      'INSERT INTO journal_lines (entry_id, account_id, debit, credit) VALUES ($1,$2,0,$3)',
      [entry.id, credit_account_id, amt]
    );

    await client.query('COMMIT');
    res.status(201).json(entry);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Journal entry failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/finance/entries - finance admin only. List all entries with their lines.
router.get('/entries', requireFinanceAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT je.*, p.full_name as payee_name,
       (SELECT json_agg(json_build_object('account_id', jl.account_id, 'account_name', coa.name, 'debit', jl.debit, 'credit', jl.credit))
        FROM journal_lines jl JOIN chart_of_accounts coa ON coa.id = jl.account_id WHERE jl.entry_id = je.id) as lines
     FROM journal_entries je
     LEFT JOIN payees p ON p.id = je.payee_id
     ORDER BY je.entry_date DESC, je.id DESC`
  );
  res.json(rows);
});

// DELETE /api/finance/entries/:id - finance admin only.
router.delete('/entries/:id', requireFinanceAdmin, async (req, res) => {
  await pool.query('DELETE FROM journal_entries WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// GET /api/finance/balances - finance admin only. Running balance per account (for reports).
router.get('/balances', requireFinanceAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT coa.id, coa.code, coa.name, coa.account_type,
       COALESCE(SUM(jl.debit),0) as total_debit,
       COALESCE(SUM(jl.credit),0) as total_credit
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl.account_id = coa.id
     GROUP BY coa.id, coa.code, coa.name, coa.account_type
     ORDER BY coa.code ASC`
  );
  res.json(rows);
});

module.exports = router;