import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SupportTicket {
  id: string
  user_id: string
  subject: string
  category: 'order_issue' | 'payment_issue' | 'technical' | 'other'
  order_id: string | null
  message: string
  status: 'open' | 'in_progress' | 'resolved'
  admin_reply: string | null
  replied_at: string | null
  created_at: string
  updated_at: string
  profiles?: { full_name: string | null; email: string }
}

export const CATEGORY_LABELS: Record<string, string> = {
  order_issue: 'Order Issue',
  payment_issue: 'Payment Issue',
  technical: 'Technical Issue',
  other: 'Other',
}

export const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
}

// ── User hooks ──────────────────────────────────────────────────────────────

export function useMyTickets() {
  return useQuery({
    queryKey: ['my-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as SupportTicket[]
    },
  })
}

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      subject: string
      category: string
      message: string
      order_id?: string | null
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({ ...payload, user_id: user.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-tickets'] }),
  })
}

// ── Notification hooks ───────────────────────────────────────────────────────

// Returns true if the user has any ticket with a new reply since they last viewed the support page
export function useHasUnreadReply() {
  return useQuery({
    queryKey: ['unread-support-reply'],
    queryFn: async () => {
      const lastViewed = localStorage.getItem('support_last_viewed') ?? '1970-01-01T00:00:00Z'
      const { data } = await supabase
        .from('support_tickets')
        .select('id')
        .not('admin_reply', 'is', null)
        .gt('replied_at', lastViewed)
        .limit(1)
      return (data?.length ?? 0) > 0
    },
    refetchInterval: 30000,
  })
}

// Returns count of open tickets — used by admin sidebar red dot
export function useOpenSupportCount() {
  return useQuery({
    queryKey: ['open-support-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
      return count ?? 0
    },
    refetchInterval: 20000,
  })
}

// ── Admin hooks ─────────────────────────────────────────────────────────────

export function useAdminTickets(status?: string) {
  return useQuery({
    queryKey: ['admin-tickets', status],
    queryFn: async () => {
      let q = supabase
        .from('support_tickets')
        .select('*, profiles!user_id(full_name, email)')
        .order('created_at', { ascending: false })
      if (status && status !== 'all') q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return data as SupportTicket[]
    },
  })
}

export function useReplyTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reply, status }: { id: string; reply: string; status: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('support_tickets')
        .update({
          admin_reply: reply,
          status,
          replied_by: user?.id,
          replied_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tickets'] }),
  })
}
