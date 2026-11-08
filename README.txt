SWARAJYA CAFE APP PACKAGE
Files: index.html, style.css, app.js, manifest.json, sw.js, supabase_schema.sql.
The app includes sales (small tea ₹7, big tea ₹12), expenses, udhar entries, loyalty stamps (6 = 1 free chai), customer lookup, and history view.
Database connection is intentionally not prefilled. Create a Supabase project, run supabase_schema.sql in SQL Editor, create Auth users, add their UUIDs to profiles as owner/staff, then add the Supabase Project URL and anon/public key in app.js.
Never put the Supabase service_role key in app.js. Owner/staff permissions are enforced by SQL RLS for accounting tables. Loyalty stamp adjustments currently available to both roles; tighten policy if required before staff use.
Offline: app shell caching only; transactions require internet. No original logo image was attached in this chat, so the current UI uses a text monogram placeholder.
