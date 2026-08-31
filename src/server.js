require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { simpleCrudRouter } = require('./utils/simpleCrud');

// Safety net: prevent the whole server from crashing on an unexpected error
// in any route (e.g. a bad Supabase Storage config, a DB hiccup). Without
// this, Node exits the process on an unhandled rejection and the service
// stays down until Render notices and restarts it — which is what earlier
// looked like "Failed to fetch" after any single broken request.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (server stays up):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server stays up):', err);
});

const app = express();
app.set('trust proxy', 1);
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
app.use('/api/news', require('./routes/news'));

// announcements and urgent_notices are structurally identical,
// so they share one route factory instead of two copy-pasted files.
// (news used to share this too, but now has its own file for image/PDF uploads.)
app.use('/api/announcements', simpleCrudRouter('announcements'));
app.use('/api/urgent', simpleCrudRouter('urgent_notices'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
