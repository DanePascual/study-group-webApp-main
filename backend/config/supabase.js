// backend/config/supabase.js
// Create and export a Supabase admin client (service role key).
// WARNING: Do NOT put the service_role key in source control. Use env vars.

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Supabase config missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars in backend/.env (or your host's secret store)."
  );
  // Optionally fail fast in production:
  // process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY || ""
);

module.exports = supabase;
