import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Zap, Sun, Moon, Eye, EyeOff } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const noScript = (val: string) => !/<|>|javascript:|on\w+\s*=|script/i.test(val)

const schema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters').refine(noScript, 'Invalid input'),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})
type FormData = z.infer<typeof schema>

export function ResetPasswordPage() {
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  // Whether a valid recovery session arrived from the email link.
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  useEffect(() => {
    // The recovery link puts tokens in the URL; the client establishes a
    // temporary session and fires PASSWORD_RECOVERY. Listen for it, and also
    // check for an already-established session (in case it resolved first).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(prev => (prev === null ? !!session : prev))
    })
    return () => subscription.unsubscribe()
  }, [])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ new_password }: FormData) => {
    const { error } = await supabase.auth.updateUser({ password: new_password })
    if (error) {
      toast.error(/session/i.test(error.message)
        ? 'Your reset link is invalid or has expired. Please request a new one.'
        : error.message)
      return
    }
    toast.success('Password updated. Please sign in with your new password.')
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
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
            <h1 className="text-2xl font-bold text-white">Set a new password</h1>
            <p className="text-gray-400 mt-1 text-sm">Choose a new password for your account</p>
          </div>

          {hasSession === false ? (
            <div className="text-center">
              <p className="text-sm text-gray-400">
                This reset link is invalid or has expired.
              </p>
              <Link to="/forgot-password">
                <Button className="w-full mt-6" size="lg">Request a new link</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="New Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                leftElement={<Lock className="w-4 h-4" />}
                rightElement={
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="text-gray-400 hover:text-gray-200 transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                error={errors.new_password?.message}
                {...register('new_password')}
              />
              <Input
                label="Confirm New Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Repeat new password"
                leftElement={<Lock className="w-4 h-4" />}
                error={errors.confirm_password?.message}
                {...register('confirm_password')}
              />
              <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
                Update Password
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Back to sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
