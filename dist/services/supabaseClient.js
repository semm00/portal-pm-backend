"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupabaseAdminClient = exports.createSupabaseServerClient = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL não definido no arquivo .env");
}
if (!SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_ANON_KEY não definido no arquivo .env");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não definido no arquivo .env");
}
const createSupabaseServerClient = () => (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
exports.createSupabaseServerClient = createSupabaseServerClient;
const createSupabaseAdminClient = () => (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
exports.createSupabaseAdminClient = createSupabaseAdminClient;
