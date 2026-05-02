import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Transaction } from '@/types'

export function useTransactions(page = 1, pageSize = 20) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['transactions', user?.id, page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (error) throw error
      return { transactions: data as Transaction[], total: count ?? 0 }
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  })
}
