import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const MAX_RESUME_BYTES = 4_000_000;
const ALLOWED_EXT = new Set(['pdf', 'doc', 'docx', 'txt', 'rtf']);

function extFromName(name: string | undefined): string | null {
  if (!name) return null;
  const m = name.match(/\.([a-zA-Z0-9]{1,8})$/);
  if (!m) return null;
  const e = m[1].toLowerCase();
  return ALLOWED_EXT.has(e) ? e : null;
}

function extFromMime(mime: string): string | null {
  const m = mime.toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('msword')) return 'doc';
  if (m.includes('wordprocessingml')) return 'docx';
  if (m.includes('plain')) return 'txt';
  if (m.includes('rtf')) return 'rtf';
  return null;
}

/**
 * Public career application endpoint.
 * POST /api/apply-career
 * {
 *   jobSlug, jobTitle, fullName, email, location?, portfolioUrl?,
 *   coverNote, promptAnswer?, resumeBase64, resumeFileName?, resumeContentType?
 * }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const body = req.body as {
    jobSlug?: string;
    jobTitle?: string;
    fullName?: string;
    email?: string;
    location?: string;
    portfolioUrl?: string;
    coverNote?: string;
    promptAnswer?: string;
    resumeBase64?: string;
    resumeFileName?: string;
    resumeContentType?: string;
  };

  const jobSlug = body.jobSlug?.trim();
  const jobTitle = body.jobTitle?.trim();
  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const coverNote = body.coverNote?.trim();
  const resumeBase64 = body.resumeBase64;

  if (!jobSlug || !jobTitle || !fullName || !email || !coverNote || !resumeBase64) {
    return res.status(400).json({
      error: 'jobSlug, jobTitle, fullName, email, coverNote, and resumeBase64 are required',
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  if (coverNote.length < 40) {
    return res.status(400).json({ error: 'Cover note is too short (min ~40 characters)' });
  }

  let buffer: Buffer;
  try {
    const raw = resumeBase64.includes(',')
      ? resumeBase64.slice(resumeBase64.indexOf(',') + 1)
      : resumeBase64;
    buffer = Buffer.from(raw, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid resume base64' });
  }
  if (buffer.length === 0) {
    return res.status(400).json({ error: 'Empty resume file' });
  }
  if (buffer.length > MAX_RESUME_BYTES) {
    return res.status(413).json({ error: 'Resume too large (max ~4MB)' });
  }

  const contentType = body.resumeContentType?.trim() || 'application/pdf';
  const ext =
    extFromName(body.resumeFileName) ?? extFromMime(contentType) ?? 'pdf';
  if (!ALLOWED_EXT.has(ext)) {
    return res.status(400).json({ error: 'Resume must be PDF, DOC, DOCX, TXT, or RTF' });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).slice(2, 10);
  const safeSlug = jobSlug.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'role';
  const filePath = `${safeSlug}/${timestamp}-${randomStr}.${ext}`;

  const { error: uploadError } = await admin.storage.from('career-resumes').upload(filePath, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) {
    console.error('[apply-career] upload', uploadError);
    return res.status(500).json({ error: `Resume upload failed: ${uploadError.message}` });
  }

  // Private bucket — store path; signed URLs can be generated for admin review later.
  const resumeUrl = `career-resumes/${filePath}`;

  const { data, error: insertError } = await admin
    .from('job_applications')
    .insert({
      job_slug: jobSlug,
      job_title: jobTitle,
      full_name: fullName,
      email,
      location: body.location?.trim() || null,
      portfolio_url: body.portfolioUrl?.trim() || null,
      cover_note: coverNote,
      prompt_answer: body.promptAnswer?.trim() || null,
      resume_url: resumeUrl,
      resume_file_name: body.resumeFileName?.trim() || `resume.${ext}`,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[apply-career] insert', insertError);
    return res.status(500).json({ error: insertError.message });
  }

  return res.status(200).json({
    success: true,
    id: data.id,
    message: 'Application received. We will review and get back to you.',
  });
}
