# SquadLift

App web mobile-first para registrar entrenamientos de gimnasio con squads de hasta 7 personas.

- Frontend: React + Vite + Tailwind
- Backend: Supabase (Auth, Postgres con RLS, Storage, Edge Functions, pg_cron)
- Hosting: Netlify (`npm run build`, publica `dist/`)

La clave de Supabase en `.env` es la clave **publicable** (segura en el navegador; la seguridad la dan las políticas RLS).
