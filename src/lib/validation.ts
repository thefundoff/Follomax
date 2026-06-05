// Common generic TLDs we accept beyond the structural 2-letter country codes.
// Anything not matching a real TLD (e.g. ".vmail") is rejected so typos and
// junk domains can't be used to register.
const VALID_GTLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name',
  'pro', 'mobi', 'tel', 'asia', 'jobs', 'coop', 'aero', 'museum', 'cat',
  'io', 'co', 'app', 'dev', 'me', 'tv', 'xyz', 'online', 'site', 'store',
  'tech', 'cloud', 'live', 'shop', 'blog', 'ai', 'us', 'uk', 'ca', 'eu',
])

// Strict email shape: local@domain.tld with no spaces and a sane TLD length.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.([A-Za-z]{2,24})$/

export function isValidEmail(email: string): boolean {
  const match = EMAIL_RE.exec(email.trim())
  if (!match) return false
  const tld = match[2].toLowerCase()
  // Accept any 2-letter country-code TLD, plus the recognized generic TLDs.
  return tld.length === 2 || VALID_GTLDS.has(tld)
}

// ---- Typo & disposable domain detection ----------------------------------
// NOTE: this is a best-effort nudge, NOT proof the address exists. A valid
// format with a real TLD (e.g. chioma@hmail.com) can't be verified without an
// email confirmation link — this only catches well-known typos and throwaways.

// Domains that are real/common — never suggest a "correction" against these.
const KNOWN_GOOD_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'yahoo.co.uk',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'zoho.com', 'mail.com', 'yandex.com',
])

// The big providers we nudge typos toward.
const SUGGESTION_TARGETS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com',
]

// Throwaway / disposable providers — these get blocked outright.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com',
  'guerrillamail.com', 'yopmail.com', 'trashmail.com', 'getnada.com',
  'sharklasers.com', 'throwawaymail.com', 'fakeinbox.com', 'maildrop.cc',
  'dispostable.com', 'mailnesia.com', 'mintemail.com', 'mohmal.com',
  'emailondeck.com', 'spam4.me', 'tempinbox.com', 'discard.email',
])

function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = email.slice(at + 1).trim().toLowerCase()
  return domain || null
}

export function isDisposableEmail(email: string): boolean {
  const domain = domainOf(email)
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false
}

// Maps an email to its provider's webmail inbox, so the confirmation screen can
// offer a one-click "Open Gmail" button. Returns null for domains we don't know
// (custom/work domains), where a generic deep link wouldn't help.
const WEBMAIL_PROVIDERS: Record<string, { label: string; url: string }> = {
  'gmail.com':       { label: 'Gmail',        url: 'https://mail.google.com/mail/u/0/#search/from%3Afollomax' },
  'googlemail.com':  { label: 'Gmail',        url: 'https://mail.google.com/mail/u/0/' },
  'yahoo.com':       { label: 'Yahoo Mail',   url: 'https://mail.yahoo.com/' },
  'ymail.com':       { label: 'Yahoo Mail',   url: 'https://mail.yahoo.com/' },
  'outlook.com':     { label: 'Outlook',      url: 'https://outlook.live.com/mail/' },
  'hotmail.com':     { label: 'Outlook',      url: 'https://outlook.live.com/mail/' },
  'live.com':        { label: 'Outlook',      url: 'https://outlook.live.com/mail/' },
  'msn.com':         { label: 'Outlook',      url: 'https://outlook.live.com/mail/' },
  'icloud.com':      { label: 'iCloud Mail',  url: 'https://www.icloud.com/mail' },
  'me.com':          { label: 'iCloud Mail',  url: 'https://www.icloud.com/mail' },
  'aol.com':         { label: 'AOL Mail',     url: 'https://mail.aol.com/' },
  'proton.me':       { label: 'Proton Mail',  url: 'https://mail.proton.me/' },
  'protonmail.com':  { label: 'Proton Mail',  url: 'https://mail.proton.me/' },
  'zoho.com':        { label: 'Zoho Mail',    url: 'https://mail.zoho.com/' },
  'yandex.com':      { label: 'Yandex Mail',  url: 'https://mail.yandex.com/' },
  'gmx.com':         { label: 'GMX Mail',     url: 'https://www.gmx.com/' },
}

export function webmailProviderFor(email: string): { label: string; url: string } | null {
  const domain = domainOf(email)
  return domain ? WEBMAIL_PROVIDERS[domain] ?? null : null
}

// Levenshtein edit distance, capped — small inputs so the full matrix is fine.
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

/**
 * Returns a corrected full email if the domain looks like a typo of a major
 * provider (e.g. "chioma@hmail.com" -> "chioma@gmail.com"), otherwise null.
 */
export function suggestEmailDomain(email: string): string | null {
  const trimmed = email.trim()
  const domain = domainOf(trimmed)
  if (!domain || domain.indexOf('.') < 0) return null
  if (KNOWN_GOOD_DOMAINS.has(domain) || DISPOSABLE_DOMAINS.has(domain)) return null

  let best: string | null = null
  let bestDist = Infinity
  for (const target of SUGGESTION_TARGETS) {
    const dist = editDistance(domain, target)
    if (dist < bestDist) {
      bestDist = dist
      best = target
    }
  }

  // Only suggest a close miss (1–2 edits) — far-off domains are likely real.
  if (best && bestDist >= 1 && bestDist <= 2) {
    const local = trimmed.slice(0, trimmed.lastIndexOf('@'))
    return `${local}@${best}`
  }
  return null
}

// ---- Login rate limiting -------------------------------------------------

const LOCKOUT_KEY = 'follomax_login_attempts'
const MAX_ATTEMPTS = 3
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes

interface AttemptState {
  count: number
  lockedUntil: number | null
}

function readState(): AttemptState {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY)
    if (!raw) return { count: 0, lockedUntil: null }
    return JSON.parse(raw) as AttemptState
  } catch {
    return { count: 0, lockedUntil: null }
  }
}

function writeState(state: AttemptState) {
  try {
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state))
  } catch {
    /* ignore storage failures */
  }
}

/** Returns remaining lockout time in ms, or 0 if not locked. */
export function getLockoutRemaining(): number {
  const { lockedUntil } = readState()
  if (lockedUntil && lockedUntil > Date.now()) return lockedUntil - Date.now()
  return 0
}

/** Records a failed login attempt and locks after MAX_ATTEMPTS. */
export function recordFailedAttempt(): number {
  const state = readState()
  const count = state.count + 1
  if (count >= MAX_ATTEMPTS) {
    const lockedUntil = Date.now() + LOCKOUT_MS
    writeState({ count: 0, lockedUntil })
    return LOCKOUT_MS
  }
  writeState({ count, lockedUntil: null })
  return 0
}

/** Clears attempt tracking after a successful login. */
export function clearFailedAttempts() {
  writeState({ count: 0, lockedUntil: null })
}

/** Mirrors a server-enforced lock locally so the countdown UI matches. */
export function setLockout(ms: number) {
  writeState({ count: 0, lockedUntil: Date.now() + ms })
}

/** Formats a millisecond duration into a friendly "Xm Ys" string. */
export function formatLockout(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
