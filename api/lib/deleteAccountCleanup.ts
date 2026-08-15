/**
 * Account-deletion helpers: purge the caller's public scan-upload objects.
 * Scan photos live at sake-images/scan-uploads/<userId>/... and remain
 * world-readable after delete_own_account unless removed explicitly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const SCAN_UPLOAD_BUCKET = 'sake-images';
const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;

/** Storage folder prefix for a user's scan uploads (no trailing slash). */
export function scanUploadsPrefix(userId: string): string {
  const id = userId.trim();
  if (!id) throw new Error('userId is required');
  if (id.includes('/') || id.includes('..')) {
    throw new Error('Invalid userId for storage path');
  }
  return `scan-uploads/${id}`;
}

/**
 * List object paths under scan-uploads/<userId>/ (bucket-relative).
 * Flat layout — uploadScanImageToStorage does not nest further.
 */
export async function listUserScanUploadPaths(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  const prefix = scanUploadsPrefix(userId);
  const paths: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin.storage.from(SCAN_UPLOAD_BUCKET).list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
    });
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const item of data) {
      if (!item?.name || item.name === '.emptyFolderPlaceholder') continue;
      // Folders have null metadata.id in some API versions; skip nameless entries.
      paths.push(`${prefix}/${item.name}`);
    }

    if (data.length < LIST_PAGE_SIZE) break;
    offset += data.length;
  }

  return paths;
}

/** Remove all scan-upload objects for the user. Returns count removed. */
export async function removeUserScanUploads(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  const paths = await listUserScanUploadPaths(admin, userId);
  if (paths.length === 0) return 0;

  let removed = 0;
  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REMOVE_BATCH_SIZE);
    const { error } = await admin.storage.from(SCAN_UPLOAD_BUCKET).remove(batch);
    if (error) throw new Error(error.message);
    removed += batch.length;
  }
  return removed;
}

/** Clear scan image URL pointers so anonymized rows do not keep dead public links. */
export async function clearUserScanImageUrls(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await admin
    .from('scans')
    .update({ scanned_image_url: null })
    .eq('user_id', userId)
    .not('scanned_image_url', 'is', null);
  if (error) throw new Error(error.message);
}
