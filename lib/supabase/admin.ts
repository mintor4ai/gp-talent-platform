import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS.
 * Only import from server-side code (server actions, route handlers).
 * Never expose to the browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
