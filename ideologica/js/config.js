// ── SUPABASE CONFIG ──
// Mesmo projeto Supabase do presence-control. A anon key aqui é a chave
// pública ("publishable"), só permite leitura (RLS bloqueia escrita para
// quem não tem a service_role key — essa fica só na rotina agendada).
const SUPABASE_URL = "https://ldkthfsczvqmotauqyis.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OtUjDdX6GbNjFFY7XyGLoQ_sOCikmgr";
