import { Link } from 'react-router-dom'
import { ExternalLink, ArrowRight } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useOrders'
import { StatusBadge } from '@/components/ui/Badge'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { formatDateTime, formatCurrency, formatNumber, truncateUrl, getPlatformIcon } from '@/lib/utils'

export function RecentOrdersTable() {
  const { data: orders, isLoading } = useRecentOrders(5)

  if (isLoading) return <TableSkeleton rows={5} />

  if (!orders?.length) {
    return (
      <div className="text-center py-10 text-gray-500">
        <p className="text-sm">No orders yet. <Link to="/orders/new" className="text-brand-400 hover:underline">Place your first order →</Link></p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {orders.map(order => (
        <div
          key={order.id}
          className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-navy-700/40 transition-colors group"
        >
          <div className="w-9 h-9 rounded-xl bg-navy-700 flex items-center justify-center text-lg flex-shrink-0">
            {order.services?.categories?.icon || getPlatformIcon(order.services?.name || '')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{order.services?.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ExternalLink className="w-3 h-3 text-gray-600" />
              <p className="text-xs text-gray-500 truncate">{truncateUrl(order.link, 35)}</p>
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1">
            <StatusBadge status={order.status} />
            <p className="text-xs text-gray-500">{formatDateTime(order.created_at)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-white">{formatCurrency(order.charge)}</p>
            <p className="text-xs text-gray-500">{formatNumber(order.quantity)} units</p>
          </div>
        </div>
      ))}

      <div className="pt-2 text-center">
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 font-medium transition-colors"
        >
          View all orders <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
