import { useState } from 'react'
import { RefreshCw, Search, ExternalLink, Info, Repeat } from 'lucide-react'
import { motion } from 'framer-motion'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { useOrders } from '@/hooks/useOrders'
import { StatusBadge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { Modal } from '@/components/ui/Modal'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Card } from '@/components/ui/Card'
import { formatDateTime, formatCurrency, formatNumber, truncateUrl, getPlatformIcon } from '@/lib/utils'
import type { OrderStatus } from '@/types/database.types'
import type { OrderWithService } from '@/types'
import { ORDER_STATUS_LABELS } from '@/types'

const STATUS_FILTERS = ['all', 'pending', 'processing', 'in_progress', 'completed', 'partial', 'cancelled', 'error'] as const

export function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detailOrder, setDetailOrder] = useState<OrderWithService | null>(null)

  const { data, isLoading, refetch, isFetching } = useOrders({ status, search, page })
  const totalPages = data ? Math.ceil(data.total / 20) : 0

  return (
    <DashboardLayout title="My Orders">
      <div className="max-w-screen-xl space-y-5">
        {/* Filters */}
        <Card padding="sm">
          <div className="space-y-2">
            {/* Status chips — horizontal scroll on mobile */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {STATUS_FILTERS.map(s => (
                <button
                  key={s}
                  onClick={() => { setStatus(s); setPage(1) }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex-shrink-0 ${
                    status === s
                      ? 'bg-brand-500 !text-white'
                      : 'bg-navy-700 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {s === 'all' ? 'All' : ORDER_STATUS_LABELS[s as OrderStatus]}
                </button>
              ))}
            </div>
            {/* Search + refresh */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by link..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1) }}
                  className="bg-navy-700 border border-navy-500 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/60 w-full"
                />
              </div>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-2 rounded-lg bg-navy-700 border border-navy-500 text-gray-400 hover:text-white transition-colors disabled:opacity-50 flex-shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </Card>

        {/* Orders */}
        {isLoading ? (
          <Card padding="none"><div className="p-4"><TableSkeleton rows={6} /></div></Card>
        ) : !data?.orders?.length ? (
          <Card padding="none">
            <div className="text-center py-16 text-gray-500">
              <p className="text-2xl mb-2">📦</p>
              <p className="font-medium text-gray-400">No orders found</p>
              <p className="text-sm mt-1">Try changing the filter or search term</p>
            </div>
          </Card>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
              {data.orders.map((order, i) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass-card rounded-xl p-4"
                  onClick={() => setDetailOrder(order)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl flex-shrink-0">{order.services?.categories?.icon || getPlatformIcon(order.services?.name || '')}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{order.services?.name || 'Unknown'}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <ExternalLink className="w-3 h-3 text-gray-600 flex-shrink-0" />
                          <span className="text-xs text-gray-500 truncate">{truncateUrl(order.link, 28)}</span>
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-navy-500/20">
                    <div className="flex items-center gap-1">
                      <span className="tabular-nums">{formatNumber(order.quantity)}</span>
                      {order.is_drip_feed && <Repeat className="w-3 h-3 text-brand-400" />}
                    </div>
                    <span className="font-semibold text-white tabular-nums">{formatCurrency(order.charge)}</span>
                    <span>{formatDateTime(order.created_at)}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Desktop table */}
            <Card padding="none" className="hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-navy-500/40">
                      {['Service', 'Link', 'Qty', 'Charge', 'Status', 'Date', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-500/20">
                    {data.orders.map((order, i) => (
                      <motion.tr
                        key={order.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-navy-700/30 transition-colors"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{order.services?.categories?.icon || getPlatformIcon(order.services?.name || '')}</span>
                            <div>
                              <p className="text-sm text-white font-medium max-w-[160px] truncate">{order.services?.name || 'Unknown'}</p>
                              {order.services?.type && <p className="text-xs text-gray-500">{order.services.type}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            <ExternalLink className="w-3 h-3 text-gray-600 flex-shrink-0" />
                            <span className="text-xs text-gray-400 max-w-[140px] truncate">{truncateUrl(order.link, 30)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            <p className="text-sm text-white tabular-nums">{formatNumber(order.quantity)}</p>
                            {order.is_drip_feed && <Repeat className="w-3 h-3 text-brand-400" />}
                          </div>
                          {order.is_drip_feed && order.drip_runs_total ? (
                            <p className="text-xs text-brand-400">{order.drip_runs_done}/{order.drip_runs_total} runs</p>
                          ) : order.remains !== null ? (
                            <p className="text-xs text-gray-500">{order.remains != null ? formatNumber(order.remains) : ''} left</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-semibold text-white tabular-nums">{formatCurrency(order.charge)}</p>
                        </td>
                        <td className="px-4 py-3.5"><StatusBadge status={order.status} /></td>
                        <td className="px-4 py-3.5"><p className="text-xs text-gray-400">{formatDateTime(order.created_at)}</p></td>
                        <td className="px-4 py-3.5">
                          <button onClick={() => setDetailOrder(order)} className="p-1.5 rounded-lg hover:bg-navy-600 text-gray-500 hover:text-white transition-colors">
                            <Info className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        )}

        {/* Order detail modal */}
        <Modal
          isOpen={!!detailOrder}
          onClose={() => setDetailOrder(null)}
          title="Order Details"
          size="lg"
        >
          {detailOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Order ID', detailOrder.id.slice(0, 8) + '...'],
                  ['ID', detailOrder.exobooster_order_id || 'Pending'],
                  ['Service', detailOrder.services?.name || 'Unknown'],
                  ['Status', <StatusBadge key="s" status={detailOrder.status} />],
                  ['Link', <a key="l" href={detailOrder.link} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline text-xs break-all">{detailOrder.link}</a>],
                  ['Quantity', formatNumber(detailOrder.quantity)],
                  ['Start Count', detailOrder.start_count != null ? formatNumber(detailOrder.start_count) : '-'],
                  ['Remains', detailOrder.remains != null ? formatNumber(detailOrder.remains) : '-'],
                  ['Charge', formatCurrency(detailOrder.charge)],
                  ['Placed', formatDateTime(detailOrder.created_at)],
                  ['Updated', formatDateTime(detailOrder.updated_at)],
                ].map(([label, value]) => (
                  <div key={label as string} className="bg-navy-700/50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <div className="text-sm text-white font-medium">{value}</div>
                  </div>
                ))}
              </div>
              {detailOrder.is_drip_feed && (
                <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Repeat className="w-4 h-4 text-brand-400" />
                    <p className="text-sm font-semibold text-brand-300">Organix</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-gray-500">Progress</p>
                      <p className="text-white font-medium">{detailOrder.drip_runs_done}/{detailOrder.drip_runs_total} runs</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Per run</p>
                      <p className="text-white font-medium">{detailOrder.drip_quantity != null ? formatNumber(detailOrder.drip_quantity) : '-'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Interval</p>
                      <p className="text-white font-medium">{detailOrder.drip_interval}h</p>
                    </div>
                  </div>
                  {detailOrder.drip_next_run_at && detailOrder.status === 'in_progress' && (
                    <p className="text-xs text-gray-400">
                      Next run: {formatDateTime(detailOrder.drip_next_run_at)}
                    </p>
                  )}
                  {detailOrder.drip_runs_total && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-navy-600 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all"
                          style={{ width: `${Math.round(((detailOrder.drip_runs_done ?? 0) / detailOrder.drip_runs_total) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-right">
                        {Math.round(((detailOrder.drip_runs_done ?? 0) / detailOrder.drip_runs_total) * 100)}% delivered
                      </p>
                    </div>
                  )}
                </div>
              )}
              {detailOrder.error_message && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-xs text-red-400">{detailOrder.error_message}</p>
                </div>
              )}
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  )
}
