import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { Settings, Key, Banknote, Globe } from 'lucide-react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { useAdminSettings, useAdminUpdateSetting } from '@/hooks/useAdminStats'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function AdminSettingsPage() {
  const { data: settings, isLoading } = useAdminSettings()
  const { mutateAsync: updateSetting, isPending } = useAdminUpdateSetting()

  const { register: regApi, handleSubmit: handleApi } = useForm({
    values: {
      exobooster_api_key: (settings?.exobooster_api_key as string) || '',
      exobooster_api_url: (settings?.exobooster_api_url as string) || 'https://exobooster.com/api/v2',
    },
  })

  const { register: regFlw, handleSubmit: handleFlw } = useForm({
    values: {
      korapay_secret_key: (settings?.korapay_secret_key as string) || '',
    },
  })

  const { register: regSite, handleSubmit: handleSite } = useForm({
    values: {
      site_name: (settings?.site_name as string) || 'Follomax',
      min_deposit_amount: String(settings?.min_deposit_amount ?? 5),
    },
  })

  const save = async (key: string, value: unknown) => {
    try {
      await updateSetting({ key, value })
    } catch {
      throw new Error('Failed to update ' + key)
    }
  }

  const onSaveApi = async (data: { exobooster_api_key: string; exobooster_api_url: string }) => {
    try {
      await Promise.all([
        save('exobooster_api_key', data.exobooster_api_key),
        save('exobooster_api_url', data.exobooster_api_url),
      ])
      toast.success('API settings saved')
    } catch { toast.error('Failed to save') }
  }

  const onSaveFlw = async (data: { korapay_secret_key: string }) => {
    try {
      await save('korapay_secret_key', data.korapay_secret_key)
      toast.success('Korapay settings saved')
    } catch { toast.error('Failed to save') }
  }

  const onSaveSite = async (data: { site_name: string; min_deposit_amount: string }) => {
    try {
      await Promise.all([
        save('site_name', data.site_name),
        save('min_deposit_amount', Number(data.min_deposit_amount)),
      ])
      toast.success('Site settings saved')
    } catch { toast.error('Failed to save') }
  }

  if (isLoading) return <AdminLayout title="Settings"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="glass-card rounded-2xl h-40" />)}</div></AdminLayout>

  return (
    <AdminLayout title="Settings">
      <div className="max-w-2xl space-y-6">
        {/* ExoBooster */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center">
              <Key className="w-4.5 h-4.5 text-brand-400" size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">ExoBooster API</h3>
              <p className="text-xs text-gray-400">Connection to the SMM service provider</p>
            </div>
          </div>
          <form onSubmit={handleApi(onSaveApi)} className="space-y-4">
            <Input label="API Key" type="password" {...regApi('exobooster_api_key')} />
            <Input label="API URL" {...regApi('exobooster_api_url')} />
            <Button type="submit" isLoading={isPending} leftIcon={<Settings className="w-4 h-4" />}>Save API Settings</Button>
          </form>
        </Card>

        {/* Korapay */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center">
              <Banknote className="w-4.5 h-4.5 text-green-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Korapay</h3>
              <p className="text-xs text-gray-400">Payment gateway configuration</p>
            </div>
          </div>
          <form onSubmit={handleFlw(onSaveFlw)} className="space-y-4">
            <Input label="Secret Key (sk_live_...)" type="password" {...regFlw('korapay_secret_key')} />
            <div className="p-3 bg-navy-700/40 rounded-xl text-xs text-gray-400 break-all">
              Webhook URL: <code className="text-brand-300">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/korapay-webhook</code>
            </div>
            <Button type="submit" isLoading={isPending}>Save Korapay Settings</Button>
          </form>
        </Card>

        {/* Site settings */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <Globe className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Site Settings</h3>
              <p className="text-xs text-gray-400">General configuration</p>
            </div>
          </div>
          <form onSubmit={handleSite(onSaveSite)} className="space-y-4">
            <Input label="Site Name" {...regSite('site_name')} />
            <Input label="Minimum Deposit Amount (USD)" type="number" min={1} {...regSite('min_deposit_amount')} />
            <Button type="submit" isLoading={isPending}>Save Site Settings</Button>
          </form>
        </Card>
      </div>
    </AdminLayout>
  )
}
