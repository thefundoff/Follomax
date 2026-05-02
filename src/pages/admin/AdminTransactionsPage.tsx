import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { useAdminAllDeposits, useAdminApproveDeposit } from '@/hooks/useAdminStats'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { formatCurrency, formatDateTime } from '@/lib/utils'

export function AdminTransactionsPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAdminAllDeposits(page)
  const { mutateAsync: reviewDeposit, isPending } = useAdminApproveDeposit()
  const totalPages = data ? Math.ceil(data.total / 20) : 0

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      await reviewDeposit({ depositId: id, action })
      toast.success(`Deposit ${action}d`)
    } catch {
      toast.error('Action failed')
    }
  }

  const statusVariant = (s: string) => ({
    pending: 'warning', approved: 'success', rejected: 'error', failed: 'error',
  } as Record<string, 'warning' | 'success' | 'error'>)[s] || 'default'

  return (
    <AdminLayout title="Deposit Requests">
      <div className="space-y-4">
        <Card padding="none">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={10} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-500/40">
                    {['User', 'Amount', 'Method', 'Tx Ref', 'Status', 'Date', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-500/20">
                  {data?.deposits?.map(dep => (
                    <tr key={dep.id} className="hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="text-sm text-white">{dep.profiles?.full_name || dep.profiles?.email || '-'}</p>
                        <p className="text-xs text-gray-500">{dep.profiles?.email}</p>
                      </td>
                      <td className="px-4 py-3.5"><span className="text-base font-bold text-green-400">{formatCurrency(dep.amount)}</span></td>
                      <td className="px-4 py-3.5"><Badge variant="info">{dep.method}</Badge></td>
                      <td className="px-4 py-3.5"><span className="text-xs text-gray-400 font-mono">{dep.flw_tx_ref || '-'}</span></td>
                      <td className="px-4 py-3.5"><Badge variant={statusVariant(dep.status)}>{dep.status}</Badge></td>
                      <td className="px-4 py-3.5"><span className="text-xs text-gray-400">{formatDateTime(dep.created_at)}</span></td>
                      <td className="px-4 py-3.5">
                        {dep.status === 'pending' && (
                          <div className="flex gap-1.5">
                            <Button size="sm" onClick={() => handleAction(dep.id, 'approve')} isLoading={isPending}>Approve</Button>
                            <Button size="sm" variant="danger" onClick={() => handleAction(dep.id, 'reject')} isLoading={isPending}>Reject</Button>
                          </div>
                        )}
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
