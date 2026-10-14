import { createClient } from '@supabase/supabase-js'
import { offlineFetch, setTokenGetter } from './offline'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    // Todas las consultas pasan por la capa sin conexión
    global: { fetch: offlineFetch }
  }
)

// La cola usa siempre la sesión vigente (se renueva sola al volver internet)
setTokenGetter(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null)
