import { useState } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { useAdminAllOrders } from '@/hooks/useAdminStats'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { formatCurrency, formatNumber, formatDateTime, truncateUrl } from '@/lib/utils'

export function AdminOrdersPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAdminAllOrders(page)
  const totalPages = data ? Math.ceil(data.total / 20) : 0

  return (
    <AdminLayout title="All Orders">
      <div className="space-y-4">
        <Card padding="none">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={10} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-500/40">
                    {['Order ID', 'User', 'Service', 'Link', 'Qty', 'Charge', 'Status', 'Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-500/20">
                  {data?.orders?.map((order: {
                    id: string
                    exobooster_order_id: number | null
                    profiles: { email: string } | null
                    services: { name: string } | null
                    link: string
                    quantity: number
                    charge: number
                    status: string
                    created_at: string
                  }) => (
                    <tr key={order.id} className="hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="text-xs text-gray-400 font-mono">{order.id.slice(0, 8)}</p>
                        {order.exobooster_order_id && <p className="text-xs text-gray-600">#{order.exobooster_order_id}</p>}
                      </td>
                      <td className="px-4 py-3.5"><span className="text-xs text-gray-300">{order.profiles?.email || '-'}</span></td>
                      <td className="px-4 py-3.5"><span className="text-sm text-white max-w-[140px] truncate block">{order.services?.name || '-'}</span></td>
                      <td className="px-4 py-3.5"><span className="text-xs text-gray-400">{truncateUrl(order.link, 25)}</span></td>
                      <td className="px-4 py-3.5"><span className="text-sm text-white">{formatNumber(order.quantity)}</span></td>
                      <td className="px-4 py-3.5"><span className="text-sm font-semibold text-white">{formatCurrency(order.charge)}</span></td>
                      <td className="px-4 py-3.5"><StatusBadge status={order.status as Parameters<typeof StatusBadge>[0]['status']} /></td>
                      <td className="px-4 py-3.5"><span className="text-xs text-gray-400">{formatDateTime(order.created_at)}</span></td>
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
