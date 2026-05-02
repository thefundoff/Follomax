import { useState } from 'react'
import { Search, Copy } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { useAdminUsers, useAdminUpdateUser } from '@/hooks/useAdminStats'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Profile } from '@/types'

export function AdminUsersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [adjustment, setAdjustment] = useState(0)

  const { data, isLoading } = useAdminUsers(page, 20, search)
  const { mutateAsync: updateUser, isPending } = useAdminUpdateUser()

  const totalPages = data ? Math.ceil(data.total / 20) : 0

  const handleToggleActive = async (user: Profile) => {
    try {
      await updateUser({ userId: user.id, updates: { is_active: !user.is_active } })
      toast.success(`User ${user.is_active ? 'suspended' : 'activated'}`)
    } catch {
      toast.error('Failed to update user')
    }
  }

  const handlePromoteToMerchant = async (user: Profile) => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase()
    try {
      await updateUser({ userId: user.id, updates: { role: 'merchant', referral_code: code } as Partial<Profile> })
      toast.success(`Promoted to merchant. Referral code: ${code}`)
    } catch {
      toast.error('Failed to promote user')
    }
  }

  const handleDemoteToUser = async (user: Profile) => {
    try {
      await updateUser({ userId: user.id, updates: { role: 'user' } })
      toast.success('Demoted to regular user')
    } catch {
      toast.error('Failed to demote user')
    }
  }

  const copyReferralLink = (user: Profile) => {
    const link = `${window.location.origin}/register?ref=${(user as Profile & { referral_code?: string }).referral_code}`
    navigator.clipboard.writeText(link)
    toast.success('Referral link copied!')
  }

  const handleAdjustBalance = async () => {
    if (!editUser || adjustment === 0) return
    try {
      await updateUser({ userId: editUser.id, updates: { balance: Math.max(0, editUser.balance + adjustment) } })
      toast.success('Balance updated')
      setEditUser(null)
    } catch {
      toast.error('Failed to update balance')
    }
  }

  return (
    <AdminLayout title="User Management">
      <div className="space-y-4">
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by email..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="input-field pl-9"
              />
            </div>
            <Badge variant="default">{data?.total ?? 0} users</Badge>
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
                    {['User', 'Balance', 'Total Spent', 'Role', 'Status', 'Joined', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-500/20">
                  {data?.users?.map(user => (
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
                      <td className="px-4 py-3.5"><span className="text-sm font-semibold text-green-400">{formatCurrency(user.balance)}</span></td>
                      <td className="px-4 py-3.5"><span className="text-sm text-gray-300">{formatCurrency(user.total_spent)}</span></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={user.role === 'admin' ? 'brand' : user.role === 'merchant' ? 'info' : 'default'}>{user.role}</Badge>
                          {user.role === 'merchant' && (user as Profile & { referral_code?: string }).referral_code && (
                            <button onClick={() => copyReferralLink(user)} className="text-gray-500 hover:text-white transition-colors" title="Copy referral link">
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><Badge variant={user.is_active ? 'success' : 'error'}>{user.is_active ? 'Active' : 'Suspended'}</Badge></td>
                      <td className="px-4 py-3.5"><span className="text-xs text-gray-400">{formatDate(user.created_at)}</span></td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => { setEditUser(user); setAdjustment(0) }}>Edit</Button>
                          {user.role === 'user' && (
                            <Button size="sm" variant="ghost" onClick={() => handlePromoteToMerchant(user)}>Merchant</Button>
                          )}
                          {user.role === 'merchant' && (
                            <Button size="sm" variant="ghost" onClick={() => handleDemoteToUser(user)}>Demote</Button>
                          )}
                          <Button size="sm" variant={user.is_active ? 'danger' : 'ghost'} onClick={() => handleToggleActive(user)}>
                            {user.is_active ? 'Suspend' : 'Activate'}
                          </Button>
                        </div>
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

      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title="Edit User" size="md">
        {editUser && (
          <div className="space-y-4">
            <div className="bg-navy-700/40 rounded-xl p-3">
              <p className="text-sm font-medium text-white">{editUser.email}</p>
              <p className="text-xs text-gray-400">Current balance: {formatCurrency(editUser.balance)}</p>
            </div>
            <Input
              label="Balance Adjustment (can be negative)"
              type="number"
              value={adjustment}
              onChange={e => setAdjustment(Number(e.target.value))}
              hint={`New balance: ${formatCurrency(Math.max(0, editUser.balance + adjustment))}`}
            />
            <Button className="w-full" onClick={handleAdjustBalance} isLoading={isPending}>
              Apply Adjustment
            </Button>
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}
