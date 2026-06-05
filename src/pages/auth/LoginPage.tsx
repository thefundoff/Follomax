import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Zap, Sun, Moon, Eye, EyeOff } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getLockoutRemaining, setLockout, clearFailedAttempts, formatLockout } from '@/lib/validation'

const noScript = (val: string) => !/<|>|javascript:|on\w+\s*=|script/i.test(val)

// Login keeps lenient email validation on purpose: the strict TLD check belongs
// at sign-up (to block junk like ".vmail"). Applying it here could lock out
// existing users whose valid-but-uncommon TLD isn't in the allowlist — and
// invalid credentials are already rejected by Supabase regardless.
const schema = z.object({
  email: z.string().email('Invalid email address').refine(noScript, 'Invalid input'),
  password: z.string().min(6, 'Password must be at least 6 characters').refine(noScript, 'Invalid input'),
})
type FormData = z.infer<typeof schema>

export function LoginPage() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [lockoutMs, setLockoutMs] = useState(() => getLockoutRemaining())

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  // Tick down the lockout countdown while the form is locked.
  useEffect(() => {
    if (lockoutMs <= 0) return
    const id = setInterval(() => {
      const remaining = getLockoutRemaining()
      setLockoutMs(remaining)
      if (remaining <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [lockoutMs])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const isLocked = lockoutMs > 0

  const onSubmit = async ({ email, password }: FormData) => {
    const remaining = getLockoutRemaining()
    if (remaining > 0) {
      setLockoutMs(remaining)
      toast.error(`Too many failed attempts. Try again in ${formatLockout(remaining)}.`)
      return
    }

    // Authenticate through the secure-login edge function, which enforces the
    // 3-strikes / 15-minute lockout server-side, then install the session.
    let data: { access_token?: string; refresh_token?: string; error?: string; locked?: boolean; code?: string; retry_after_seconds?: number }
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secure-login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
          },
          body: JSON.stringify({ email, password }),
        }
      )
      data = await res.json()

      if (!res.ok) {
        if (data.code === 'email_not_confirmed') {
          toast.error('Please confirm your email first — check your inbox for the link.')
          return
        }
        if (data.locked && data.retry_after_seconds) {
          const ms = data.retry_after_seconds * 1000
          setLockout(ms)
          setLockoutMs(ms)
        }
        toast.error(data.error || 'Invalid email or password')
        return
      }
    } catch {
      toast.error('Login failed. Please try again.')
      return
    }

    const { error } = await supabase.auth.setSession({
      access_token: data.access_token!,
      refresh_token: data.refresh_token!,
    })
    if (error) {
      toast.error('Login failed. Please try again.')
      return
    }
    clearFailedAttempts()
    navigate('/dashboard')
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
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-brand shadow-brand mb-4">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-gray-400 mt-1 text-sm">Sign in to your Follomax account</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              leftElement={<Mail className="w-4 h-4" />}
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              leftElement={<Lock className="w-4 h-4" />}
              rightElement={
                <button type="button" onClick={() => setShowPassword(v => !v)} className="text-gray-400 hover:text-gray-200 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={errors.password?.message}
              {...register('password')}
            />

            <div className="text-right -mt-1">
              <Link to="/forgot-password" className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors">
                Forgot password?
              </Link>
            </div>

            {isLocked && (
              <p className="text-center text-sm text-red-400">
                Too many failed attempts. Try again in {formatLockout(lockoutMs)}.
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting} disabled={isLocked}>
              {isLocked ? `Locked (${formatLockout(lockoutMs)})` : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Sign up for free
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
