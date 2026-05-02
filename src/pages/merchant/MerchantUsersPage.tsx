import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Card } from '@/components/ui/Card'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { useMerchantUsers } from '@/hooks/useMerchant'
import { formatCurrency, formatDate } from '@/lib/utils'

export function MerchantUsersPage() {
  const { data: users, isLoading } = useMerchantUsers()

  return (
    <DashboardLayout title="My Users">
      <div className="max-w-screen-xl">
        <Card padding="none">
          <div className="px-4 py-3 border-b border-navy-500/30 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Users Under Your Account</h3>
            <span className="text-xs text-gray-500 bg-navy-700 px-2 py-1 rounded-full">{users?.length ?? 0} users</span>
          </div>

          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} /></div>
          ) : !users?.length ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-2xl mb-2">👥</p>
              <p className="font-medium text-gray-400">No users yet</p>
              <p className="text-sm mt-1">Share your referral link from the dashboard to get users</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-500/40">
                    {['User', 'Balance', 'Total Spent', 'Joined'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-500/20">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-brand flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                            {(user.full_name || user.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{user.full_name || 'No name'}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-semibold text-green-400">{formatCurrency(user.balance)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-gray-300">{formatCurrency(user.total_spent)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-gray-400">{formatDate(user.created_at!)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  )
}
