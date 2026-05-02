# Follomax — Vercel Deployment Guide

Follow every step in order. Do not skip steps.

---

## Prerequisites

Before deploying, make sure you have:
- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (sign up free with your GitHub)
- A [Supabase](https://supabase.com) project already created
- Your ExoBooster API key
- Your Korapay public and secret keys

---

## Step 1 — Push the project to GitHub

1. Go to [github.com/new](https://github.com/new)
2. Create a new **private** repository named `follomax`
3. Leave it empty (no README, no .gitignore)
4. Click **Create repository**

Now open a terminal in your Follomax project folder and run these commands one by one:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/follomax.git
git push -u origin main
```

> Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Step 2 — Run Supabase migrations

You must apply all database migrations before the app works.

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Open your project
3. Click **SQL Editor** in the left sidebar
4. Click **New query**
5. Open each file below, paste the contents, and click **Run**:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rls.sql`
   - `supabase/migrations/003_cron.sql`
   - `supabase/migrations/006_widen_rate_columns.sql`

Run them **in order** (001 first, then 002, etc.).

---

## Step 3 — Deploy Supabase Edge Functions

You need the Supabase CLI installed. Run this once to install it:

```bash
npm install -g supabase
```

Then log in:

```bash
supabase login
```

Link your project (get your project ref from the Supabase Dashboard URL — it looks like `abcdefghijklmnop`):

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Set the required secrets (replace each value with your real keys):

```bash
supabase secrets set EXOBOOSTER_API_KEY=your_exobooster_key
supabase secrets set EXOBOOSTER_API_URL=https://exobooster.com/api/v2
supabase secrets set KORAPAY_SECRET_KEY=your_korapay_secret_key
supabase secrets set KORAPAY_WEBHOOK_HASH=your_korapay_webhook_hash
```

> The `KORAPAY_WEBHOOK_HASH` is a string you choose yourself (e.g. `follomax-webhook-2025`). You will use the same value in Korapay's dashboard in Step 6.

Now deploy all edge functions:

```bash
supabase functions deploy place-order
supabase functions deploy sync-services
supabase functions deploy check-order-status
supabase functions deploy korapay-webhook
supabase functions deploy add-funds-manual
supabase functions deploy reseller-api
```

---

## Step 4 — Set up the cron job

This makes order statuses auto-update every 5 minutes.

1. In your Supabase Dashboard, go to **Database → Extensions**
2. Search for `pg_cron` and enable it if not already enabled
3. Go to **SQL Editor** and run:

```sql
select cron.schedule(
  'check-order-status',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/check-order-status',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
```

---

## Step 5 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and click **Add New Project**
2. Click **Import Git Repository** and select your `follomax` repo
3. Vercel will auto-detect it as a Vite project. Leave all build settings as default:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Before clicking Deploy, click **Environment Variables** and add these three:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL (e.g. `https://abcdef.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `VITE_KORAPAY_PUBLIC_KEY` | Your Korapay public key |

> Find your Supabase URL and anon key in: Supabase Dashboard → Settings → API

5. Click **Deploy**
6. Wait for the build to finish (usually 1–2 minutes)
7. Vercel will give you a live URL like `https://follomax.vercel.app`

---

## Step 6 — Configure Korapay webhook

1. Log in to your [Korapay Dashboard](https://dashboard.korapay.com)
2. Go to **Settings → Webhooks**
3. Set the webhook URL to:
   ```
   https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/korapay-webhook
   ```
4. Set the **Webhook Hash** to the same value you used for `KORAPAY_WEBHOOK_HASH` in Step 3
5. Save

---

## Step 7 — Add a custom domain (optional)

1. In Vercel, open your project → **Settings → Domains**
2. Click **Add Domain** and enter your domain (e.g. `follomax.com`)
3. Vercel will give you DNS records to add at your domain registrar (Namecheap, GoDaddy, etc.)
4. Add the records, wait up to 24 hours for DNS to propagate
5. Vercel will automatically issue an SSL certificate

---

## Step 8 — First-time setup after going live

1. Open your live site and **register the first account** — this will be your admin account
2. Go to your Supabase Dashboard → **Table Editor → profiles**
3. Find your user row and change the `role` column from `user` to `admin`
4. Log out and log back in to your site
5. You should now see the **Admin** section in the sidebar
6. Go to **Admin → Services** and click **Sync Now** to pull all services from ExoBooster
7. Your panel is live and ready to accept orders

---

## Step 9 — Future code updates

Whenever you make changes to the code, just push to GitHub:

```bash
git add .
git commit -m "describe your change"
git push
```

Vercel will automatically detect the push and redeploy within 1–2 minutes. No manual action needed.

---

## Troubleshooting

**White screen after deploy**
- Check that all 3 environment variables are set correctly in Vercel
- Make sure there are no typos in the Supabase URL or keys

**Orders not updating status**
- Check the cron job was created successfully (Step 4)
- Verify the `check-order-status` function was deployed

**Payments not crediting balance**
- Double-check the Korapay webhook URL and hash match exactly
- Check Supabase Edge Function logs: Dashboard → Edge Functions → korapay-webhook → Logs

**"Failed to place order" error**
- Confirm `EXOBOOSTER_API_KEY` secret is set correctly (Step 3)
- Check Edge Function logs: Dashboard → Edge Functions → place-order → Logs
