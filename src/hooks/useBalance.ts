import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export function useBalance() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['balance', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      return data.balance as number
    },
    enabled: !!user,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 30,
  })
}
