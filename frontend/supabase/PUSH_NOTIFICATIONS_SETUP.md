# Web push setup

This project now has background push code, but it will not deliver push until the Supabase migration, function, VAPID secrets, Vault entries, and frontend public key are configured. Push checks run every 15 minutes on Supabase Cron; they do not depend on an open SpendIndix tab.

## 1. Generate VAPID keys

Generate a key pair locally. Keep the private key out of the repository and Netlify frontend variables:

```sh
npx web-push generate-vapid-keys --json
```

Use a contact address controlled by the SpendIndix operator as `VAPID_SUBJECT`, for example `mailto:admin@example.com`.

## 2. Apply migration and deploy the function

From `frontend/`, link the Supabase CLI to the production project (if it is not already linked), then run:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy push-notifications
```

The migration creates user-scoped push subscriptions, a server-only delivery queue, and a 15-minute Cron job. The job remains dormant until its three required Vault secrets are present.

## 3. Configure Edge Function secrets

In **Supabase Dashboard → Edge Functions → Secrets**, set:

- `VAPID_PUBLIC_KEY`: generated public key.
- `VAPID_PRIVATE_KEY`: generated private key.
- `VAPID_SUBJECT`: `mailto:` contact or operator site URL.
- `PUSH_CRON_SECRET`: a new random secret, for example generated with `openssl rand -hex 32`.

Do not use a `VITE_` prefix for private values. The function uses Supabase's injected `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; neither is placed in frontend code.

## 4. Configure Cron's Vault values

In **Supabase Dashboard → SQL Editor**, run these statements after replacing the placeholders. The gateway `apikey` header uses the project's public publishable key; the function independently validates `x-cron-secret`, so no privileged API key is put in the Cron HTTP request queue. Use the exact same random value as the Edge Function's `PUSH_CRON_SECRET`. These values are stored in Supabase Vault, not in this repository.

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
select vault.create_secret('YOUR_SUPABASE_PUBLISHABLE_KEY', 'supabase_publishable_key');
select vault.create_secret('YOUR_PUSH_CRON_SECRET', 'push_cron_secret');
```

If a value needs rotation, update the named Vault secret in the dashboard or use `vault.update_secret` with its Vault secret UUID; also update the corresponding Edge Function secret when rotating `PUSH_CRON_SECRET`.

Check **Integrations → Cron** (or `select jobname, schedule, active from cron.job`) to confirm the job exists. Review `cron.job_run_details` for HTTP request creation and Supabase Function logs for evaluation or delivery errors.

## 5. Configure and deploy the frontend

Set the VAPID **public** key only as `VITE_VAPID_PUBLIC_KEY` in Netlify's site environment variables. If Netlify offers variable scopes, include **Builds** (and the production deploy context). Vite embeds this public value during the build; it is not read by the browser from Netlify at runtime. The Vite config now stops Netlify builds when the value is missing, rather than publishing an unusable push button. Then trigger a new frontend deployment. For local HTTPS development, put it in `frontend/.env.local` (ignored by git). The worker is served at `/sw.js`; production must use HTTPS and serve the app at the domain root.

The user must sign in, open Settings, and explicitly click **Enable push notifications** on each device/browser. That click requests browser permission. The existing budget, savings, and recurring switches control both in-app and push categories. Disabling push removes that browser's subscription; it does not affect subscriptions on other devices.

## 6. Verify delivery

After setup, use a real budget threshold, savings milestone, or recurring rule due tomorrow. Enable push on a device, close the SpendIndix tab, and wait for the next 15-minute scheduled check. A notification click opens the related SpendIndix page. Delivery attempts, expired endpoint cleanup, and errors are recorded by Supabase Function logs and the server-only queue.

No notification is sent for fabricated/test finance activity. Push delivery depends on the browser's operating system and vendor push service. Some browsers require the app to be installed; force-stopped mobile browsers, disabled OS notifications, power-saving policies, and expired vendor subscriptions can delay or prevent delivery. Scheduled checks are every 15 minutes, so a recurring reminder may arrive around its one-day-before date rather than at an exact time.
