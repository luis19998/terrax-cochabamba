// Optional cloud copy of the saved plots (Supabase). Without a sign-in, plots stay only on this device.
// The table public.parcels has row level security: each person can read and change only their own rows.
// The project URL and publishable key come from /api/config (Netlify environment variables), not from the repository.
const LIB = "vendor/supabase/supabase.js"; // @supabase/supabase-js 2.118.0, browser bundle

let client = null;
let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("No se pudo cargar la librería de cuentas"));
    document.head.append(s);
  });
}

/** true when this browser already has a session, or is coming back from the e-mail link */
export function hasPendingSession() {
  if (/access_token=|error_description=/.test(location.hash)) return true;
  try {
    return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  } catch { return false; }
}

export function connect(config) {
  if (client) return Promise.resolve(client);
  if (!loading) {
    loading = loadScript(LIB).then(() => {
      client = window.supabase.createClient(config.url, config.key, {
        // implicit flow: the e-mail link also works when it opens in another browser (for example, inside the mail app)
        auth: { flowType: "implicit", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      return client;
    }).catch((error) => { loading = null; throw error; });
  }
  return loading;
}

export async function currentUser() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session ? data.session.user : null;
}

export function onAuthChange(callback) {
  if (client) client.auth.onAuthStateChange((event, session) => callback(session ? session.user : null, event));
}

export async function sendLink(email) {
  const redirect = `${location.origin}${location.pathname}`;
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyCode(email, token) {
  const { error } = await client.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}

export async function signOut() {
  if (client) await client.auth.signOut({ scope: "local" });
}

/** all plots of the signed-in person, newest first, in the same shape as the local ones */
export async function pull() {
  const { data, error } = await client.from("parcels").select("client_id, data, updated_at").order("updated_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data.map((row) => ({ ...row.data, id: row.client_id }));
}

export async function push(entries) {
  const user = await currentUser();
  if (!user || !entries.length) return;
  const rows = entries.map((p) => ({ user_id: user.id, client_id: p.id, name: p.name || null, data: p }));
  const { error } = await client.from("parcels").upsert(rows, { onConflict: "user_id,client_id" });
  if (error) throw error;
}

export async function remove(clientId) {
  const user = await currentUser();
  if (!user) return;
  const { error } = await client.from("parcels").delete().eq("client_id", clientId);
  if (error) throw error;
}

/** local and cloud lists joined by id; the most recently saved copy of each plot wins */
export function merge(local, remote) {
  const byId = new Map();
  for (const p of [...remote, ...local]) {
    const known = byId.get(p.id);
    if (!known || new Date(p.savedAt || 0) > new Date(known.savedAt || 0)) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
}
