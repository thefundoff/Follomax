import { useState } from 'react'
import { motion } from 'framer-motion'
import { Users, TrendingUp, ShoppingCart, DollarSign, Copy, Check, ExternalLink } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Pagination } from '@/components/ui/Pagination'
import { useMerchantStats, useMerchantOrders } from '@/hooks/useMerchant'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatNumber, formatDateTime, getPlatformIcon, truncateUrl } from '@/lib/utils'

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">{label}</p>
            <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

export function MerchantDashboardPage() {
  const { profile } = useAuth()
  const { data: stats, isLoading: statsLoading } = useMerchantStats()
  const [page, setPage] = useState(1)
  const { data: ordersData, isLoading: ordersLoading } = useMerchantOrders(page)
  const [copied, setCopied] = useState(false)

  const referralLink = profile?.referral_code
    ? `${window.location.origin}/register?ref=${profile.referral_code}`
    : null

  const copyLink = () => {
    if (!referralLink) return
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    toast.success('Referral link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const totalPages = ordersData ? Math.ceil(ordersData.total / 20) : 0

  return (
    <DashboardLayout title="Merchant Dashboard">
      <div className="max-w-screen-xl space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Users" value={statsLoading ? '—' : formatNumber(stats?.usersCount ?? 0)} color="bg-brand-500/15 text-brand-400" />
          <StatCard icon={TrendingUp} label="Cashback Earned" value={statsLoading ? '—' : formatCurrency(stats?.totalProfit ?? 0)} color="bg-green-500/15 text-green-400" />
          <StatCard icon={ShoppingCart} label="Total Orders" value={statsLoading ? '—' : formatNumber(stats?.totalOrders ?? 0)} color="bg-blue-500/15 text-blue-400" />
          <StatCard icon={DollarSign} label="Revenue Generated" value={statsLoading ? '—' : formatCurrency(stats?.totalRevenue ?? 0)} color="bg-orange-500/15 text-orange-400" />
        </div>

        {/* Referral link */}
        <Card>
          <h3 className="text-base font-semibold text-white mb-3">Your Referral Link</h3>
          {referralLink ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-navy-700/60 border border-navy-500/40 rounded-xl px-4 py-2.5">
                <p className="text-sm text-gray-300 truncate">{referralLink}</p>
              </div>
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 !text-white text-sm font-medium transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No referral code assigned yet. Contact admin to activate your merchant account.</p>
          )}
          <p className="text-xs text-gray-500 mt-2">Share this link — users who sign up via it will be linked to your account and charged at your custom rates.</p>
        </Card>

        {/* Recent orders from your users */}
        <Card padding="none">
          <div className="px-4 py-3 border-b border-navy-500/30">
            <h3 className="text-base font-semibold text-white">Your Users' Orders</h3>
          </div>

          {ordersLoading ? (
            <div className="p-4"><TableSkeleton rows={8} /></div>
          ) : !ordersData?.orders?.length ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-2xl mb-2">📦</p>
              <p className="text-sm">No orders yet from your users</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-500/40">
                    {['Service', 'Link', 'Qty', 'Charge', 'Status', 'Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-500/20">
                  {ordersData.orders.map((order: Record<string, unknown>) => (
                    <tr key={order.id as string} className="hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{(order.services as Record<string, unknown> | null)?.categories ? getPlatformIcon(String((order.services as Record<string, unknown>).name)) : '🔧'}</span>
                          <p className="text-sm text-white font-medium max-w-[140px] truncate">{String((order.services as Record<string, unknown> | null)?.name ?? 'Unknown')}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <ExternalLink className="w-3 h-3 text-gray-600 flex-shrink-0" />
                          <span className="text-xs text-gray-400 max-w-[120px] truncate">{truncateUrl(String(order.link), 28)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><p className="text-sm text-white tabular-nums">{formatNumber(order.quantity as number)}</p></td>
                      <td className="px-4 py-3.5"><p className="text-sm font-semibold text-white tabular-nums">{formatCurrency(order.charge as number)}</p></td>
                      <td className="px-4 py-3.5"><StatusBadge status={order.status as import('@/types/database.types').OrderStatus} /></td>
                      <td className="px-4 py-3.5"><p className="text-xs text-gray-400">{formatDateTime(order.created_at as string)}</p></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-4 pb-4 mt-2">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  )
}
