import { useState, useRef } from 'react'
import { RefreshCw, Check, X, Pencil } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { useAdminServices, useAdminSyncServices, useAdminToggleService, useAdminUpdateServiceRate } from '@/hooks/useAdminStats'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { formatCurrency, getPlatformIcon } from '@/lib/utils'

export function AdminServicesPage() {
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRate, setEditRate] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { data, isLoading } = useAdminServices(page)
  const { mutateAsync: syncServices, isPending: isSyncing } = useAdminSyncServices()
  const { mutateAsync: toggleService } = useAdminToggleService()
  const { mutateAsync: updateRate } = useAdminUpdateServiceRate()

  const totalPages = data ? Math.ceil(data.total / 50) : 0

  const handleSync = async () => {
    try {
      const result = await syncServices()
      toast.success(`Synced ${result.synced} services, ${result.categories_created} new categories`)
    } catch {
      toast.error('Sync failed. Check your ExoBooster API key in Settings.')
    }
  }

  const handleToggle = async (serviceId: number, isActive: boolean) => {
    try {
      await toggleService({ serviceId, isActive: !isActive })
      toast.success(isActive ? 'Service disabled' : 'Service enabled')
    } catch {
      toast.error('Failed to update service')
    }
  }

  const startEdit = (serviceId: number, currentRate: number) => {
    setEditingId(serviceId)
    setEditRate(currentRate.toString())
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const saveRate = async (serviceId: number) => {
    const rate = parseFloat(editRate)
    if (isNaN(rate) || rate <= 0) {
      toast.error('Enter a valid rate')
      return
    }
    try {
      await updateRate({ serviceId, rate })
      toast.success('Rate updated')
    } catch {
      toast.error('Failed to update rate')
    }
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  return (
    <AdminLayout title="Service Management">
      <div className="space-y-4">
        <Card padding="sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">ExoBooster Service Catalog</p>
              <p className="text-xs text-gray-400">{data?.total ?? 0} services total</p>
            </div>
            <Button
              leftIcon={<RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />}
              onClick={handleSync}
              isLoading={isSyncing}
            >
              Sync Services
            </Button>
          </div>
        </Card>

        <Card padding="none">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={10} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-500/40">
                    {['ID', 'Service', 'Category', 'Rate/1K', 'Min/Max', 'Status', 'Last Sync', 'Toggle'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-500/20">
                  {data?.services?.map((svc: {
                    id: number
                    exobooster_id: number
                    name: string
                    categories: { name: string } | null
                    rate: number
                    min_quantity: number
                    max_quantity: number
                    is_active: boolean
                    last_synced_at: string | null
                  }) => (
                    <tr key={svc.id} className={`hover:bg-navy-700/30 transition-colors ${!svc.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">#{svc.exobooster_id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{svc.categories?.name ? getPlatformIcon(svc.categories.name) : '📦'}</span>
                          <p className="text-sm text-white max-w-[200px] truncate">{svc.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="text-xs text-gray-400">{svc.categories?.name || '-'}</span></td>
                      <td className="px-4 py-3">
                        {editingId === svc.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              ref={inputRef}
                              type="number"
                              step="0.000001"
                              min="0"
                              value={editRate}
                              onChange={e => setEditRate(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveRate(svc.id)
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              className="w-24 bg-navy-600 border border-brand-500/50 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                            <button onClick={() => saveRate(svc.id)} className="p-1 text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={cancelEdit} className="p-1 text-gray-500 hover:text-gray-300"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <span className="text-sm font-semibold text-brand-300">{formatCurrency(svc.rate)}</span>
                            <button
                              onClick={() => startEdit(svc.id, svc.rate)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-brand-400 transition-opacity"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3"><span className="text-xs text-gray-400">{svc.min_quantity} / {svc.max_quantity}</span></td>
                      <td className="px-4 py-3"><Badge variant={svc.is_active ? 'success' : 'default'}>{svc.is_active ? 'Active' : 'Disabled'}</Badge></td>
                      <td className="px-4 py-3"><span className="text-xs text-gray-500">{svc.last_synced_at ? format(new Date(svc.last_synced_at), 'MMM d') : 'Never'}</span></td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggle(svc.id, svc.is_active)}
                          className={`p-1.5 rounded-lg transition-colors ${svc.is_active ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-green-500/10 text-green-400'}`}
                        >
                          {svc.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
      </div>
    </AdminLayout>
  )
}
