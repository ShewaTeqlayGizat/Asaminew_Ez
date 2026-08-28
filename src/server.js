require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { simpleCrudRouter } = require('./utils/simpleCrud');

const app = express();app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// Only allow requests from your GitHub Pages site (and localhost for dev).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());
app.use(cors({ origin: allowedOrigins }));

// General rate limit as a baseline safety net across all routes.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/setup-admin', require('./routes/setup'));
app.use('/api/members', require('./routes/members'));
app.use('/api/member-registry', require('./routes/memberRegistry'));
app.use('/api/training', require('./routes/training'));
app.use('/api/content', require('./routes/content'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/info-board', require('./routes/infoBoard'));

// news, announcements, and urgent_notices are structurally identical,
// so they share one route factory instead of three copy-pasted files.
app.use('/api/news', simpleCrudRouter('news'));
app.use('/api/announcements', simpleCrudRouter('announcements'));
app.use('/api/urgent', simpleCrudRouter('urgent_notices'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
