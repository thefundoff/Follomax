import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User, Key, Copy, RefreshCw, Eye, EyeOff, Check } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { motion } from 'framer-motion'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { useProfile, useUpdateProfile, useRegenerateApiKey } from '@/hooks/useProfile'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
})
type FormData = z.infer<typeof schema>

export function ProfilePage() {
  const { data: profile, isLoading } = useProfile()
  const { mutateAsync: updateProfile, isPending: isUpdating } = useUpdateProfile()
  const { mutateAsync: regenerateKey, isPending: isRegenerating } = useRegenerateApiKey()
  const [showApiKey, setShowApiKey] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: { full_name: profile?.full_name || '' },
  })

  const onSubmit = async (data: FormData) => {
    try {
      await updateProfile(data)
      toast.success('Profile updated!')
    } catch {
      toast.error('Failed to update profile')
    }
  }

  const handleCopyKey = async () => {
    if (!profile?.api_key) return
    await navigator.clipboard.writeText(profile.api_key)
    setKeyCopied(true)
    toast.success('API key copied!')
    setTimeout(() => setKeyCopied(false), 2000)
  }

  const handleRegenerateKey = async () => {
    if (!confirm('Regenerate your API key? Any existing integrations will stop working.')) return
    try {
      await regenerateKey()
      toast.success('API key regenerated!')
    } catch {
      toast.error('Failed to regenerate API key')
    }
  }

  if (isLoading) {
    return <DashboardLayout title="Profile"><div className="animate-pulse space-y-4">
      {[1,2,3].map(i => <div key={i} className="glass-card rounded-2xl h-40" />)}
    </div></DashboardLayout>
  }

  return (
    <DashboardLayout title="Profile & Settings">
      <div className="max-w-2xl space-y-6">
        {/* Account info */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-brand flex items-center justify-center text-2xl font-bold text-white shadow-brand">
                {(profile?.full_name || profile?.email || 'U')[0].toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-bold text-white">{profile?.full_name || 'No name set'}</p>
                <p className="text-sm text-gray-400">{profile?.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={profile?.role === 'admin' ? 'brand' : 'default'}>
                    {profile?.role === 'admin' ? 'Admin' : 'User'}
                  </Badge>
                  <span className="text-xs text-gray-500">
                    Member since {profile ? formatDate(profile.created_at) : ''}
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1">
                  <Input
                    label="Full Name"
                    placeholder="Your full name"
                    error={errors.full_name?.message}
                    {...register('full_name')}
                  />
                </div>
              </div>
              <Input
                label="Email address"
                type="email"
                value={profile?.email || ''}
                disabled
                hint="Email cannot be changed"
              />
              <Button type="submit" isLoading={isUpdating}>Save Changes</Button>
            </form>
          </Card>
        </motion.div>

        {/* API Key */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center">
                <Key className="w-4.5 h-4.5 text-brand-400" size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">API Access</h3>
                <p className="text-xs text-gray-400">Use this key to integrate Follomax into your own systems</p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-navy-700/60 rounded-xl px-4 py-3 mb-3 border border-navy-500/50">
              <Key className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <code className="flex-1 text-sm text-brand-300 font-mono truncate">
                {showApiKey ? profile?.api_key : '••••••••••••••••••••••••••••••••'}
              </code>
              <button onClick={() => setShowApiKey(s => !s)} className="text-gray-400 hover:text-white transition-colors p-1">
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleCopyKey} leftIcon={keyCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}>
                {keyCopied ? 'Copied!' : 'Copy Key'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleRegenerateKey} isLoading={isRegenerating} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
                Regenerate
              </Button>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-navy-700/40 border border-navy-500/30">
              <p className="text-xs font-medium text-gray-300 mb-2">API Endpoint</p>
              <code className="text-xs text-brand-300 font-mono break-all">
                {import.meta.env.VITE_SUPABASE_URL}/functions/v1/reseller-api
              </code>
              <p className="text-xs text-gray-500 mt-2">
                POST with JSON: <code className="text-brand-400">{'{"key":"YOUR_KEY","action":"services|add|balance|status"}'}</code>
              </p>
            </div>
          </Card>
        </motion.div>

        {/* Account stats */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <h3 className="text-base font-semibold text-white mb-4">Account Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Total Spent', `$${profile?.total_spent?.toFixed(2) ?? '0.00'}`],
                ['Account Status', profile?.is_active ? '✅ Active' : '❌ Suspended'],
                ['Role', profile?.role === 'admin' ? '⚡ Admin' : '👤 User'],
                ['Member Since', profile ? formatDate(profile.created_at) : '-'],
              ].map(([label, value]) => (
                <div key={label} className="bg-navy-700/40 rounded-xl p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-sm font-semibold text-white mt-1">{value}</p>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  )
}
