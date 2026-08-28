const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const { secret, username, password } = req.query;

  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(403).send('Forbidden: wrong or missing secret.');
  }

  const { rows: existing } = await pool.query('SELECT id FROM admins LIMIT 1');
  if (existing.length > 0) {
    return res.status(403).send('An admin already exists. This setup route is now disabled for safety.');
  }

  if (!username || !password) {
    return res.status(400).send('Add ?username=...&password=... to the URL (plus your secret).');
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [username, hash]);

  res.send(`Admin "${username}" created successfully. You can now log in on the site.`);
});

module.exports = router;
