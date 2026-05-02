import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { DepositRequest } from '@/types'

export function useDepositRequests() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['deposit-requests', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as DepositRequest[]
    },
    enabled: !!user,
  })
}

export function useCreateDepositRequest() {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      amount: number
      method: string
      flw_tx_id?: string
      flw_tx_ref?: string
    }) => {
      const { data, error } = await supabase
        .from('deposit_requests')
        .insert({ ...payload, user_id: user!.id })
        .select()
        .single()
      if (error) throw error
      return data as DepositRequest
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposit-requests'] })
    },
  })
}
