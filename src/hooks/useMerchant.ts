import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Profile } from '@/types'

export function useMerchantStats() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['merchant-stats', user?.id],
    queryFn: async () => {
      const [{ count: usersCount }, { data: commissions }, { data: userIds }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('merchant_id', user!.id),
        supabase.from('transactions').select('amount').eq('user_id', user!.id).eq('type', 'merchant_commission'),
        supabase.from('profiles').select('id').eq('merchant_id', user!.id),
      ])

      const totalProfit = commissions?.reduce((sum, t) => sum + t.amount, 0) ?? 0
      const ids = userIds?.map(u => u.id) ?? []

      let totalOrders = 0
      let totalRevenue = 0

      if (ids.length > 0) {
        const { data: orders } = await supabase.from('orders').select('charge').in('user_id', ids)
        totalOrders = orders?.length ?? 0
        totalRevenue = orders?.reduce((sum, o) => sum + o.charge, 0) ?? 0
      }

      return { usersCount: usersCount ?? 0, totalProfit, totalOrders, totalRevenue }
    },
    enabled: !!user,
    staleTime: 1000 * 60,
  })
}

export function useMerchantUsers() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['merchant-users', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('merchant_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Profile[]
    },
    enabled: !!user,
    staleTime: 1000 * 60,
  })
}


export function useMerchantOrders(page = 1) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['merchant-orders', user?.id, page],
    queryFn: async () => {
      const { data: userIds } = await supabase.from('profiles').select('id').eq('merchant_id', user!.id)
      const ids = userIds?.map(u => u.id) ?? []
      if (ids.length === 0) return { orders: [], total: 0 }

      const pageSize = 20
      const { data, error, count } = await supabase
        .from('orders')
        .select('*, services(name, categories(icon))', { count: 'exact' })
        .in('user_id', ids)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (error) throw error
      return { orders: data ?? [], total: count ?? 0 }
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  })
}
