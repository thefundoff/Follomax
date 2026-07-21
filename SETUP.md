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
supabase functions deploy place-combo-order
supabase functions deploy sync-services
supabase functions deploy check-order-status
supabase functions deploy flutterwave-webhook
supabase functions deploy add-funds-manual
supabase functions deploy reseller-api

# Folly — Telegram assistant (see section 12)
supabase functions deploy telegram-link-code
supabase functions deploy telegram-webhook
supabase functions deploy gemini-status   # admin AI-health check for the dashboard
supabase functions deploy whatsapp-webhook # Folly on WhatsApp (see section 13)
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

## 12. Folly — the Telegram AI Assistant

Folly lets users chat on Telegram to browse services, check their balance, place
orders and track them — reusing the same order pipeline as the web app. The AI brain
is Google Gemini (free tier).

**Prerequisites**
1. Run migrations `supabase/migrations/014_telegram.sql` and `015_telegram_phone.sql` in the SQL Editor.
2. Create a bot with [@BotFather](https://t.me/BotFather) → note the **bot token** and **username**.
3. Get a free **Gemini API key** at https://aistudio.google.com/apikey.
4. Choose a long random string for the **webhook secret**.

**Set the secrets** in Supabase → Table Editor → `app_settings` (or via SQL), replacing
the placeholders seeded by the migration:

```sql
UPDATE app_settings SET value = '"123456:ABC-your-bot-token"'      WHERE key = 'telegram_bot_token';
UPDATE app_settings SET value = '"YourBotUsername"'                 WHERE key = 'telegram_bot_username'; -- no @
UPDATE app_settings SET value = '"a-long-random-webhook-secret"'    WHERE key = 'telegram_webhook_secret';
UPDATE app_settings SET value = '"your-gemini-api-key"'             WHERE key = 'gemini_api_key';
UPDATE app_settings SET value = '"https://your-follomax-domain.com"' WHERE key = 'web_app_url';
-- optional: change the model (default gemini-flash-latest — must support generateContent + tools)
-- UPDATE app_settings SET value = '"gemini-flash-latest"' WHERE key = 'gemini_model';
```

**Deploy & disable JWT verification.** Telegram sends no Supabase JWT, so the webhook
must skip JWT verification (like the other webhooks):

```bash
supabase functions deploy telegram-link-code
supabase functions deploy telegram-webhook --no-verify-jwt
supabase functions deploy place-order   # redeploy: now shares _shared/order-core.ts
```

If `--no-verify-jwt` isn't available in your CLI, open Supabase → Edge Functions →
`telegram-webhook` → turn **Verify JWT** off.

**Register the webhook** with Telegram (use the same secret you stored above):

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://YOUR_PROJECT_REF.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=a-long-random-webhook-secret"
```

**Onboarding — no web app required.** When a user messages the bot, Folly asks whether
they're new or already have an account:
- **Create account** → a passwordless Follomax account is provisioned instantly, bound to
  their Telegram id (synthetic email under the hood; name pulled from Telegram). It then
  optionally asks them to verify a phone number (Telegram "share contact"), stored on the
  profile for future WhatsApp parity.
- **I have an account** → they enter their Follomax email + password once (verified
  server-side, with the same `login_lockouts` protection as the web login), and their
  Telegram is linked to that existing profile + balance.

Referral deep links work too: `t.me/<bot>?start=ref_<merchant_referral_code>` credits the
referring merchant on the new account.

The web **Profile → Connect Telegram** button still works (generates `t.me/<bot>?start=<code>`)
for users who prefer to link from the web. Once connected, users can chat naturally:
"what Instagram services do you have?", "send 1000 likes to <link>", "what's my balance?".

**Buttons & AI-free fallback.** Folly also works entirely without Gemini — via a main-menu
inline keyboard, a guided button ordering flow (pick platform → service → link → quantity →
confirm), and keyword recognition ("balance", "orders", "services", "add funds", "help").
If the Gemini key is exhausted, missing, or erroring, Folly automatically falls back to this
deterministic layer (in `_shared/folly-core.ts`, which is channel-agnostic and reused by the
future WhatsApp handler). The Telegram command menu is registered via `setMyCommands`
(/menu, /balance, /orders, /services, /addfunds, /help) — re-run it if you change the commands:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{"commands":[{"command":"menu","description":"Main menu"},{"command":"balance","description":"Check your wallet balance"},{"command":"orders","description":"Your recent orders"},{"command":"services","description":"Browse & order services"},{"command":"addfunds","description":"Top up your wallet"},{"command":"help","description":"How to use Folly"}]}'
```

## 13. Folly on WhatsApp (official Cloud API — free & safe)

Folly runs on WhatsApp via Meta's **official WhatsApp Cloud API** — the only safe,
ToS-compliant route. **Do not** use unofficial libraries (Baileys, whatsapp-web.js,
venom-bot); they get numbers permanently banned. Replies are free: because Folly only
*responds* to users, every message stays inside WhatsApp's 24-hour service window (no
paid templates). It reuses the same brain as Telegram (`_shared/folly-core`,
`folly-agent`, `folly-onboarding`), and a user who verified their phone on Telegram is
**auto-recognized on WhatsApp** by that number.

**1. Prerequisites**
- Run migration `supabase/migrations/017_whatsapp.sql`.
- Create a [Meta developer account](https://developers.facebook.com/) → **Create App** →
  type **Business** → add the **WhatsApp** product.

**2. Collect four values** (from the Meta app):
- **Access token** — WhatsApp → API Setup gives a 24-hour token to start. For production,
  create a **System User** (Business Settings → Users → System Users) with a **permanent**
  token (`whatsapp_business_messaging` + `whatsapp_business_management` permissions).
- **Phone number ID** — WhatsApp → API Setup (the test number's ID, not the phone number).
- **App secret** — App Settings → Basic → *Show* app secret.
- **Verify token** — any long random string you choose (used only for the webhook handshake).

**3. Store the secrets** (Supabase → `app_settings`, replacing the migration placeholders):

```sql
UPDATE app_settings SET value = '"EAAG...your-access-token"'      WHERE key = 'whatsapp_access_token';
UPDATE app_settings SET value = '"123456789012345"'              WHERE key = 'whatsapp_phone_number_id';
UPDATE app_settings SET value = '"a-long-random-verify-token"'   WHERE key = 'whatsapp_verify_token';
UPDATE app_settings SET value = '"your-app-secret"'              WHERE key = 'whatsapp_app_secret';
```

**4. Deploy** (JWT off — Meta sends no Supabase JWT):

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

**5. Configure the webhook** in Meta → WhatsApp → Configuration → Edit:
- **Callback URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook`
- **Verify token:** the same random string you stored above → click **Verify and save**.
- Under **Webhook fields**, subscribe to **`messages`**.

**6. Pilot free (no verification):** in WhatsApp → API Setup, add up to **5 recipient
numbers**. Message the test number from one of them — Folly replies with the onboarding
buttons. This is fully free and needs no business verification.

**7. Go public (when ready):** add your own phone number and complete **Business
Verification** (free; needs business documents, takes a few days). Only then can Folly
message arbitrary customers beyond the 5 test numbers.
