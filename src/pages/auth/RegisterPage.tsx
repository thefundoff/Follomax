import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, User, Zap, Sun, Moon, Eye, EyeOff, MailCheck } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { isValidEmail, isDisposableEmail, suggestEmailDomain, webmailProviderFor } from '@/lib/validation'

const noScript = (val: string) => !/<|>|javascript:|on\w+\s*=|script/i.test(val)

const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(80, 'Name too long').refine(noScript, 'Invalid characters in name'),
  email: z.string().email('Invalid email address').refine(isValidEmail, 'Please enter a valid email address').refine(e => !isDisposableEmail(e), 'Disposable email addresses are not allowed').refine(noScript, 'Invalid input'),
  password: z.string().min(8, 'Password must be at least 8 characters').refine(noScript, 'Invalid input'),
  confirm_password: z.string(),
}).refine(d => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})
type FormData = z.infer<typeof schema>

export function RegisterPage() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const refCode = searchParams.get('ref')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const emailValue = watch('email') ?? ''
  const emailSuggestion = suggestEmailDomain(emailValue)

  const onSubmit = async ({ email, password, full_name }: FormData) => {
    // Confirm the domain can actually receive mail before signing up, so we
    // don't trigger a confirmation email that just bounces (which throttles our
    // sending reputation). Fails open if the check itself is unavailable.
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            // Send the anon key as a Bearer token too, so the function passes the
            // default JWT gate without needing "Verify JWT" disabled.
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
          },
          body: JSON.stringify({ email }),
        }
      )
      if (res.ok) {
        const { valid } = await res.json()
        if (!valid) {
          toast.error("That email domain can't receive mail. Please check the address.")
          return
        }
      }
    } catch {
      // Validation service unreachable — continue and let Supabase handle it.
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Where the confirmation link sends the user back to. /login picks up the
        // session from the URL and forwards to /dashboard once verified.
        emailRedirectTo: `${window.location.origin}/login`,
        data: { full_name, ...(refCode ? { referral_code: refCode } : {}) },
      },
    })
    if (error) {
      toast.error(error.message)
      return
    }
    // With "Confirm email" enabled, signUp returns no session — the account is
    // inactive until the emailed link is clicked. Show the check-inbox screen.
    // (If confirmation is disabled, a session is returned and we log straight in,
    // so this stays backward-compatible.)
    if (!data.session) {
      setPendingEmail(email)
    } else {
      toast.success('Account created! Welcome to Follomax.')
      navigate('/dashboard')
    }
  }

  const handleResend = async () => {
    if (!pendingEmail) return
    setResending(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    })
    setResending(false)
    if (error) toast.error(error.message)
    else toast.success('Confirmation email resent.')
  }

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4 py-20">
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-2 rounded-xl bg-navy-800/80 hover:bg-navy-700 text-gray-400 hover:text-brand-400 transition-colors z-10"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-brand-500/8 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="glass-card rounded-2xl p-8">
          {pendingEmail ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-brand shadow-brand mb-4">
                <MailCheck className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Confirm your email</h1>
              <p className="text-gray-400 mt-2 text-sm">
                We sent a confirmation link to{' '}
                <span className="text-white font-medium">{pendingEmail}</span>.
                Click it to activate your account, then sign in.
              </p>
              <p className="text-gray-500 mt-3 text-xs">
                Didn't get it? Check your spam folder, or resend below.
              </p>

              {(() => {
                const provider = webmailProviderFor(pendingEmail)
                return provider ? (
                  <a href={provider.url} target="_blank" rel="noopener noreferrer">
                    <Button type="button" className="w-full mt-6" size="lg">
                      Open {provider.label}
                    </Button>
                  </a>
                ) : null
              })()}

              <Button
                type="button"
                className="w-full mt-3"
                size="lg"
                variant="secondary"
                onClick={handleResend}
                isLoading={resending}
              >
                Resend confirmation email
              </Button>

              <p className="text-center text-sm text-gray-500 mt-6">
                Already confirmed?{' '}
                <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                  Sign in
                </Link>
              </p>
            </div>
          ) : (
          <>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-brand shadow-brand mb-4">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Create your account</h1>
            <p className="text-gray-400 mt-1 text-sm">Start growing your social media today</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              placeholder="John Doe"
              leftElement={<User className="w-4 h-4" />}
              error={errors.full_name?.message}
              {...register('full_name')}
            />
            <div>
              <Input
                label="Email address"
                type="email"
                placeholder="you@example.com"
                leftElement={<Mail className="w-4 h-4" />}
                error={errors.email?.message}
                {...register('email')}
              />
              {emailSuggestion && !errors.email && (
                <p className="mt-1.5 text-xs text-amber-400">
                  Did you mean{' '}
                  <button
                    type="button"
                    onClick={() => setValue('email', emailSuggestion, { shouldValidate: true })}
                    className="font-semibold underline hover:text-amber-300 transition-colors"
                  >
                    {emailSuggestion}
                  </button>
                  ?
                </p>
              )}
            </div>
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              leftElement={<Lock className="w-4 h-4" />}
              rightElement={
                <button type="button" onClick={() => setShowPassword(v => !v)} className="text-gray-400 hover:text-gray-200 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={errors.password?.message}
              {...register('password')}
            />
            <Input
              label="Confirm Password"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Repeat your password"
              leftElement={<Lock className="w-4 h-4" />}
              rightElement={
                <button type="button" onClick={() => setShowConfirmPassword(v => !v)} className="text-gray-400 hover:text-gray-200 transition-colors">
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={errors.confirm_password?.message}
              {...register('confirm_password')}
            />

            <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
              Create Account
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>

          <p className="text-center text-xs text-gray-600 mt-4">
            By creating an account you agree to our Terms of Service and Privacy Policy
          </p>
          </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
