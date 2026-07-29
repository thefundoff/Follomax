import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export interface AppNotification {
  id: string
  title: string
  body: string
  order_id: string | null
  type: string
  is_read: boolean
  created_at: string
}

// Unread notifications for the current user, polled so alerts surface without a reload.
export function useUnreadNotifications() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notifications', 'unread', user?.id],
    enabled: !!user,
    refetchInterval: 45_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_read', false)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as AppNotification[]
    },
  })
}

export async function markNotificationsRead(ids: string[]) {
  if (!ids.length) return
  await supabase.from('notifications').update({ is_read: true }).in('id', ids)
}
