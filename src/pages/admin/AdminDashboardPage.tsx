import { useState } from 'react'
import { Users, Package, DollarSign, Clock, Bot, Send, MessageCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { useAdminStats, useAdminPendingDeposits, useAdminApproveDeposit, useAdminBotUsers } from '@/hooks/useAdminStats'
import { AiStatusCard } from '@/components/dashboard/AiStatusCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatNumber, formatDateTime } from '@/lib/utils'
import { toast } from 'react-hot-toast'

export function AdminDashboardPage() {
  const { data: stats, isLoading } = useAdminStats()
  const { data: pendingDeposits } = useAdminPendingDeposits()
  const { mutateAsync: reviewDeposit, isPending } = useAdminApproveDeposit()
  const [botPage, setBotPage] = useState(1)
  const { data: botUsers, isLoading: botLoading } = useAdminBotUsers(botPage)

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatsCard label="Total Users" value={formatNumber(stats?.total_users ?? 0)} icon={Users} iconColor="text-brand-400" iconBg="bg-brand-500/15" isLoading={isLoading} delay={0} />
          <StatsCard label="Bot Users" value={formatNumber(stats?.bot_users ?? 0)} subtitle={`Telegram ${formatNumber(stats?.telegram_users ?? 0)} · WhatsApp ${formatNumber(stats?.whatsapp_users ?? 0)}`} icon={Bot} iconColor="text-cyan-400" iconBg="bg-cyan-500/15" isLoading={isLoading} delay={0.05} />
          <StatsCard label="Orders Today" value={formatNumber(stats?.orders_today ?? 0)} icon={Package} iconColor="text-blue-400" iconBg="bg-blue-500/15" isLoading={isLoading} delay={0.1} />
          <StatsCard label="Total Revenue" value={formatCurrency(stats?.total_revenue ?? 0)} icon={DollarSign} iconColor="text-green-400" iconBg="bg-green-500/15" isLoading={isLoading} delay={0.15} />
          <StatsCard label="Pending Deposits" value={formatNumber(stats?.pending_deposits ?? 0)} icon={Clock} iconColor="text-orange-400" iconBg="bg-orange-500/15" isLoading={isLoading} delay={0.2} />
        </div>

        {/* Folly AI (Gemini) status */}
        <AiStatusCard />

        {/* Bot users — everyone linked to Folly on Telegram or WhatsApp */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">Bot Users</h3>
            <span className="text-xs text-gray-400">{formatNumber(botUsers?.total ?? 0)} total</span>
          </div>
          {botLoading ? (
            <p className="text-center py-8 text-gray-500 text-sm">Loading…</p>
          ) : !botUsers?.users.length ? (
            <p className="text-center py-8 text-gray-500 text-sm">No bot users yet</p>
          ) : (
            <>
              <div className="space-y-2">
                {botUsers.users.map((u) => {
                  const onTelegram = u.telegram_user_id != null
                  const onWhatsApp = u.whatsapp_id != null
                  return (
                    <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-navy-700/40">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{u.full_name || u.email}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{u.email}</p>
                      </div>
                      {onTelegram && (
                        <Badge variant="info" className="flex items-center gap-1">
                          <Send className="w-3 h-3" /> {u.telegram_user_id}
                        </Badge>
                      )}
                      {onWhatsApp && (
                        <Badge variant="success" className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" /> {u.whatsapp_id}
                        </Badge>
                      )}
                    </div>
                  )
                })}
              </div>
              {botUsers.total > 20 && (
                <div className="flex items-center justify-between mt-4">
                  <Button size="sm" variant="secondary" disabled={botPage === 1} onClick={() => setBotPage((p) => Math.max(1, p - 1))}>Previous</Button>
                  <span className="text-xs text-gray-400">Page {botPage} of {Math.ceil(botUsers.total / 20)}</span>
                  <Button size="sm" variant="secondary" disabled={botPage >= Math.ceil(botUsers.total / 20)} onClick={() => setBotPage((p) => p + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
        </Card>

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
