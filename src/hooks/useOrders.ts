import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { OrderWithService, PlaceOrderPayload, PlaceOrderResponse } from '@/types'
import type { OrderStatus } from '@/types/database.types'

interface OrderFilters {
  status?: OrderStatus | 'all'
  search?: string
  page?: number
  pageSize?: number
}

export function useOrders(filters: OrderFilters = {}) {
  const { user } = useAuth()
  const { status, search, page = 1, pageSize = 20 } = filters

  return useQuery({
    queryKey: ['orders', user?.id, status, search, page],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          *,
          services(id, name, type, categories(id, name, icon))
        `, { count: 'exact' })
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (status && status !== 'all') query = query.eq('status', status)
      if (search) query = query.ilike('link', `%${search}%`)

      const { data, error, count } = await query
      if (error) throw error
      return { orders: data as OrderWithService[], total: count ?? 0 }
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  })
}

export function useRecentOrders(limit = 5) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['recent-orders', user?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, services(id, name, type, categories(id, name, icon))')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as OrderWithService[]
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  })
}

export function usePlaceOrder() {
  const { session } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/place-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session!.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to place order')
      return data as PlaceOrderResponse
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['recent-orders'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['balance'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useOrderStats() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['order-stats', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('status, charge')
        .eq('user_id', user!.id)
      if (error) throw error

      const rows = data as { status: string; charge: number }[]
      return {
        total: rows.length,
        active: rows.filter(o => ['pending','processing','in_progress'].includes(o.status)).length,
        completed: rows.filter(o => o.status === 'completed').length,
        total_spent: rows.reduce((sum, o) => sum + o.charge, 0),
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60,
  })
}
