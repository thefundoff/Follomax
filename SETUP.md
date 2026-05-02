# Follomax — Setup Guide

## 1. Create a Supabase Project

1. Go to https://supabase.com and create a free project
2. Note your **Project URL** and **anon key** (Settings → API)
3. Note your **service_role key** (for edge functions)

## 2. Run Database Migrations

In your Supabase dashboard → SQL Editor, run these files in order:
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls.sql`

## 3. Configure Environment Variables

Edit `.env.local` with your actual values:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_FLW_PUBLIC_KEY=FLWPUBK-your-flutterwave-public-key
```

## 4. Update App Settings in Database

After running migrations, update these settings in Supabase → Table Editor → app_settings:

| Key | Value |
|-----|-------|
| `exobooster_api_key` | Your ExoBooster API key |
| `flw_secret_key` | Your Flutterwave secret key |
| `flw_webhook_secret_hash` | Your Flutterwave webhook secret hash |

## 5. Deploy Edge Functions

Install Supabase CLI: https://supabase.com/docs/guides/cli

```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set EXOBOOSTER_API_KEY=your_key
supabase secrets set EXOBOOSTER_API_URL=https://exobooster.com/api/v2
supabase secrets set FLW_SECRET_KEY=your_flw_secret_key
supabase secrets set FLW_WEBHOOK_SECRET_HASH=your_hash

# Deploy all functions
supabase functions deploy place-order
supabase functions deploy sync-services
supabase functions deploy check-order-status
supabase functions deploy flutterwave-webhook
supabase functions deploy add-funds-manual
supabase functions deploy reseller-api
```

## 6. Configure Flutterwave Webhook

In your Flutterwave dashboard → Webhooks:
- URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/flutterwave-webhook`
- Secret Hash: (same value as `flw_webhook_secret_hash`)

## 7. Enable Google OAuth (Optional)

In Supabase → Authentication → Providers → Google:
- Enable Google
- Add your Google OAuth credentials
- Add `http://localhost:5173` and your production domain to Redirect URLs

## 8. Set Up Order Status Cron Job

In Supabase → Database → SQL Editor, run `supabase/migrations/003_cron.sql` 
(after uncommenting and filling in your project ref and service role key)

## 9. Make Your First Admin

After registering your account, in Supabase → Table Editor → profiles:
- Find your user row
- Change `role` from `user` to `admin`

## 10. Sync Services

Log in as admin → go to /admin/services → click "Sync Services"

## 11. Start Development

```bash
npm run dev
```

Open http://localhost:5173
