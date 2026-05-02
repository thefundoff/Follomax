import { Users, Package, DollarSign, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { useAdminStats, useAdminPendingDeposits, useAdminApproveDeposit } from '@/hooks/useAdminStats'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatNumber, formatDateTime } from '@/lib/utils'
import { toast } from 'react-hot-toast'

export function AdminDashboardPage() {
  const { data: stats, isLoading } = useAdminStats()
  const { data: pendingDeposits } = useAdminPendingDeposits()
  const { mutateAsync: reviewDeposit, isPending } = useAdminApproveDeposit()

  const handleReview = async (id: string, action: 'approve' | 'reject') => {
    try {
      await reviewDeposit({ depositId: id, action })
      toast.success(`Deposit ${action}d successfully`)
    } catch {
      toast.error('Action failed')
    }
  }

  return (
    <AdminLayout title="Admin Overview">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard label="Total Users" value={formatNumber(stats?.total_users ?? 0)} icon={Users} iconColor="text-brand-400" iconBg="bg-brand-500/15" isLoading={isLoading} delay={0} />
          <StatsCard label="Orders Today" value={formatNumber(stats?.orders_today ?? 0)} icon={Package} iconColor="text-blue-400" iconBg="bg-blue-500/15" isLoading={isLoading} delay={0.05} />
          <StatsCard label="Total Revenue" value={formatCurrency(stats?.total_revenue ?? 0)} icon={DollarSign} iconColor="text-green-400" iconBg="bg-green-500/15" isLoading={isLoading} delay={0.1} />
          <StatsCard label="Pending Deposits" value={formatNumber(stats?.pending_deposits ?? 0)} icon={Clock} iconColor="text-orange-400" iconBg="bg-orange-500/15" isLoading={isLoading} delay={0.15} />
        </div>

        {/* Pending deposits */}
        <Card>
          <h3 className="text-base font-semibold text-white mb-4">Pending Deposit Requests</h3>
          {!pendingDeposits?.length ? (
            <p className="text-center py-8 text-gray-500 text-sm">No pending deposits</p>
          ) : (
            <div className="space-y-3">
              {pendingDeposits.map((deposit: { id: string; profiles: { email: string; full_name: string | null } | null; amount: number; method: string; flw_tx_ref: string | null; created_at: string }) => (
                <motion.div
                  key={deposit.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-navy-700/40"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{deposit.profiles?.email || 'Unknown'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {deposit.method} · {deposit.flw_tx_ref || 'No ref'} · {formatDateTime(deposit.created_at)}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-green-400">{formatCurrency(deposit.amount)}</p>
                  <Badge variant="warning">Pending</Badge>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleReview(deposit.id, 'approve')} isLoading={isPending}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => handleReview(deposit.id, 'reject')} isLoading={isPending}>Reject</Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  )
}
