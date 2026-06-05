import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Zap, Sun, Moon, MailCheck, ArrowLeft } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { webmailProviderFor } from '@/lib/validation'

const noScript = (val: string) => !/<|>|javascript:|on\w+\s*=|script/i.test(val)

const schema = z.object({
  email: z.string().email('Invalid email address').refine(noScript, 'Invalid input'),
})
type FormData = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const { theme, toggleTheme } = useTheme()
  const [sentTo, setSentTo] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ email }: FormData) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    // Don't reveal whether the email exists — always show the same confirmation.
    if (error && !/rate/i.test(error.message)) {
      console.error('resetPasswordForEmail error:', error)
    }
    setSentTo(email)
  }

  const provider = sentTo ? webmailProviderFor(sentTo) : null

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
          {sentTo ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-brand shadow-brand mb-4">
                <MailCheck className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Check your email</h1>
              <p className="text-gray-400 mt-2 text-sm">
                If an account exists for{' '}
                <span className="text-white font-medium">{sentTo}</span>, we've sent a
                password reset link. Click it to set a new password.
              </p>
              <p className="text-gray-500 mt-3 text-xs">
                Didn't get it? Check your spam folder.
              </p>

              {provider && (
                <a href={provider.url} target="_blank" rel="noopener noreferrer">
                  <Button type="button" className="w-full mt-6" size="lg">
                    Open {provider.label}
                  </Button>
                </a>
              )}

              <p className="text-center text-sm text-gray-500 mt-6">
                <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                  Back to sign in
                </Link>
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-brand shadow-brand mb-4">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Forgot your password?</h1>
                <p className="text-gray-400 mt-1 text-sm">Enter your email and we'll send you a reset link</p>
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
                <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
                  Send reset link
                </Button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                <Link to="/login" className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 font-medium transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
