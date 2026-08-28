# ShewaTeqlayGizat — Backend API

Replaces the hardcoded `DATA` object and `localStorage` calls in the
frontend with a real API + Postgres database, and adds admin login so
only you (or your team) can create/edit/delete content.

## What's here

- **Express API** (`src/`) — REST endpoints for every content type on the site
- **Postgres schema** (`sql/schema.sql`) — tables for members, news,
  announcements, urgent notices, training, a shared `content_items` table
  (library / education / entertainment / topic boards), gallery, comments,
  and the info board
- **JWT admin auth** — login-protected create/edit/delete; everything else
  stays publicly readable
- **File uploads** — go to Supabase Storage, not the database (see the
  design note in our conversation about why)

## 1. Set up the database (Supabase — free tier)

1. Create a project at supabase.com
2. Go to **SQL Editor**, paste the contents of `sql/schema.sql`, run it
3. Go to **Storage**, create a bucket named `uploads`, set it to **public**
4. Copy your project's connection string (**Settings → Database**) — that's
   your `DATABASE_URL`
5. Copy **Settings → API → service_role key** — that's your
   `SUPABASE_SERVICE_ROLE_KEY` (keep this secret, never expose it to the
   frontend)

## 2. Configure environment variables

```
cp .env.example .env
```

Fill in `DATABASE_URL`, `JWT_SECRET` (any long random string),
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ALLOWED_ORIGINS`
(your GitHub Pages URL, e.g. `https://yourusername.github.io`).

## 3. Create your admin login

```
npm install
node src/createAdmin.js myusername mypassword
```

This is the account you'll use to log in and manage news, the info
board, gallery, etc. Run it again anytime to reset a password.

## 4. Run locally

```
npm start
```

Visit `http://localhost:3000/health` — should return `{"ok":true}`.

## 5. Deploy the API (Render — free tier)

1. Push this `backend/` folder to a GitHub repo
2. On Render: **New → Web Service**, connect the repo
3. Build command: `npm install` — Start command: `npm start`
4. Add all the same environment variables from your `.env`
5. Render gives you a URL like `https://your-api.onrender.com` — that's
   what the frontend will call

Note: Render's free tier sleeps after 15 minutes of inactivity. The
first request after idle takes 10–30 seconds to wake up — normal for a
low-traffic site, just don't be alarmed by it.

## 6. Point the frontend at it

In your HTML file, replace the hardcoded `const DATA = {...}` and the
`localStorage`-based comment/info-board code with `fetch()` calls to
these endpoints, e.g.:

```js
fetch('https://your-api.onrender.com/api/news')
  .then(r => r.json())
  .then(news => { /* render it */ });
```

Admin actions (posting news, deleting a comment, etc.) need the token
from `/api/auth/login` sent as `Authorization: Bearer <token>`.

## API reference

| Endpoint | Method | Auth | Notes |
|---|---|---|---|
| `/api/auth/login` | POST | — | `{username, password}` → `{token}` |
| `/api/members` | GET / POST / PUT / DELETE | write=admin | leadership roster |
| `/api/news` | GET / POST / PUT / DELETE | write=admin | |
| `/api/announcements` | GET / POST / PUT / DELETE | write=admin | |
| `/api/urgent` | GET / POST / PUT / DELETE | write=admin | |
| `/api/training` | GET / POST / PUT / DELETE | write=admin | |
| `/api/content?type=&topic=` | GET / POST / DELETE | write=admin | library, eduText/Pdf/Ppt, entVideo/Audio/Lit/Culture, topic boards — see `VALID_TYPES` in `routes/content.js` |
| `/api/gallery?type=` | GET / POST / DELETE | write=admin | photo or video |
| `/api/member-registry` | GET / POST / DELETE | **admin-only, all methods** | internal roster — holds personal data (birthplace, marital status), so viewing also requires login |
| `/api/comments` | GET / POST / DELETE | delete=admin | POST is public but rate-limited |
| `/api/info-board` | GET / POST / DELETE | write=admin | previously open to anyone — now locked down |

## Design notes

- **Files live in object storage, not Postgres.** Uploaded PDFs/images go
  to Supabase Storage; the database only stores the resulting URL. Keeps
  the free Postgres tier from filling up.
- **`content_items` is one shared table** for what used to be eight
  parallel arrays in `DATA` (library, eduText, eduPdf, eduPpt, entVideo,
  entAudio, entLit, entCulture) plus topic boards, distinguished by a
  `type` column. Simpler schema, one set of routes instead of eight.
- **Comments stay open to the public**, but rate-limited per IP and
  protected by a honeypot field. The info board, which used to allow
  anyone to post or delete, is now admin-only.
