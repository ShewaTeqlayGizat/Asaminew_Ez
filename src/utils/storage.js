// File upload helper using Supabase Storage.
// Keeps large binary files (PDFs, images, videos) OUT of Postgres —
// only the resulting URL is stored in the database.
//
// Requires a Supabase project with a public bucket (default name: "uploads").
// Env vars needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';

/**
 * Uploads a file buffer to Supabase Storage and returns its public URL.
 * @param {Buffer} buffer - file contents
 * @param {string} originalName - original filename (used to derive extension)
 * @param {string} mimeType - e.g. 'application/pdf'
 * @param {string} folder - subfolder, e.g. 'info-board', 'gallery'
 */
async function uploadFile(buffer, originalName, mimeType, folder = 'misc') {
  const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
  const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

module.exports = { uploadFile };
