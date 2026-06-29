import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
// Accept either the new "secret" key name or the classic service-role name.
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseReady() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function isAdminConfigured() {
  return Boolean(supabaseUrl && supabaseSecretKey);
}

// Service-role client — bypasses RLS. Server-side only, used for the invite
// flow (creating users, reading/writing the invitations table). Never expose
// the secret key to the browser.
export function createAdminClient() {
  if (!isAdminConfigured()) {
    throw new Error(
      "Supabase admin is not configured. Add SUPABASE_SECRET_KEY to backend/.env."
    );
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

export function createSupabaseForToken(token) {
  if (!isSupabaseReady()) {
    throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to backend/.env.");
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}
