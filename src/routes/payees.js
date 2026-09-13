const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { uploadFile } = require('../utils/storage');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again later.' },
});

function requireFinanceAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== 'admin' && req.admin.role !== 'finance_admin') {
      return res.status(403).json({ error: 'Finance admin access required' });
    }
    next();
  });
}

function requirePayee(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.kind !== 'payee') return res.status(401).json({ error: 'Invalid token type' });
    req.payee = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// POST /api/payees/admin-create - finance admin only. Register a payee.
router.post('/admin-create', requireFinanceAdmin, async (req, res) => {
  const { full_name, payee_type, phone, email, password, bank_account } = req.body;
  if (!full_name || !payee_type || !password) return res.status(400).json({ error: 'full_name, payee_type, password required' });
  const { rows: existing } = await pool.query('SELECT id FROM payees WHERE full_name = $1', [full_name]);
  if (existing.length) return res.status(409).json({ error: 'That name is already registered' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    'INSERT INTO payees (full_name, payee_type, phone, email, password_hash, bank_account) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, full_name, payee_type',
    [full_name, payee_type, phone || null, email || null, hash, bank_account || null]
  );
  res.status(201).json({ payee: rows[0] });
});

// GET /api/payees - finance admin only. List all payees.
router.get('/', requireFinanceAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id, full_name, payee_type, phone, email, bank_account FROM payees ORDER BY full_name ASC');
  res.json(rows);
});

// POST /api/payees/login - by full_name + password
router.post('/login', loginLimiter, async (req, res) => {
  const { full_name, password } = req.body;
  if (!full_name || !password) return res.status(400).json({ error: 'full_name and password required' });
  const { rows } = await pool.query('SELECT * FROM payees WHERE full_name = $1', [full_name]);
  const payee = rows[0];
  if (!payee) return res.status(401).json({ error: 'Invalid credentials' });

  if (payee.locked_until && new Date(payee.locked_until) > new Date()) {
    const minsLeft = Math.ceil((new Date(payee.locked_until) - new Date()) / 60000);
    return res.status(403).json({ error: `Account locked. Try again in ${minsLeft} minutes.` });
  }

  const valid = await bcrypt.compare(password, payee.password_hash);
  if (!valid) {
    const attempts = (payee.failed_attempts || 0) + 1;
    if (attempts >= 3) {
      await pool.query(`UPDATE payees SET failed_attempts=$1, locked_until = now() + interval '24 hours' WHERE id=$2`, [attempts, payee.id]);
      return res.status(403).json({ error: 'Too many failed attempts. Account locked for 24 hours.' });
    }
    await pool.query('UPDATE payees SET failed_attempts=$1 WHERE id=$2', [attempts, payee.id]);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await pool.query('UPDATE payees SET failed_attempts=0, locked_until=NULL WHERE id=$1', [payee.id]);
  const token = jwt.sign({ id: payee.id, full_name: payee.full_name, kind: 'payee' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, payee: { id: payee.id, full_name: payee.full_name, payee_type: payee.payee_type } });
});

// GET /api/payees/my-ledger - payee only. Their own transaction history + balance.
router.get('/my-ledger', requirePayee, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT je.id, je.entry_date, je.description, je.reason, je.payment_method, je.bank_reference, je.receipt_url,
            jl.debit, jl.credit
     FROM journal_entries je
     JOIN journal_lines jl ON jl.entry_id = je.id
     JOIN chart_of_accounts coa ON coa.id = jl.account_id
     WHERE je.payee_id = $1 AND coa.account_type = 'liability'
     ORDER BY je.entry_date DESC, je.id DESC`,
    [req.payee.id]
  );
  let balance = 0;
  rows.forEach(r => { balance += (parseFloat(r.credit) - parseFloat(r.debit)); });
  res.json({ transactions: rows, balance });
});

module.exports = { router, requirePayee, requireFinanceAdmin };