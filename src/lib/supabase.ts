import { createClient } from '@supabase/supabase-js';

// Publishable values: safe to ship to the browser, access is enforced by row level security.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://neauzvqroaszvqffahkv.supabase.co';
const key = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_Ldzj7mbE2Yx28l0rxLAj4w_ywoGKXzv';

// All accounting tables live in the "acct" schema so the project can be shared with other apps.
export const sb = createClient(url, key, { db: { schema: 'acct' } });

/** Throw the Supabase error so callers can show it, otherwise return the data. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
