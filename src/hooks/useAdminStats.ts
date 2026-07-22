import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Profile, DepositRequest } from '@/types'

export function useAdminUsers(page = 1, pageSize = 20, search = '') {
  return useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (search) query = query.ilike('email', `%${search}%`)

      const { data, error, count } = await query
      if (error) throw error
      return { users: data as Profile[], total: count ?? 0 }
    },
  })
}

// Linked bot users — profiles reachable on a chat channel (Telegram or WhatsApp).
// Frontend-only: reads existing profile fields. There is no stored @username, so the
// UI shows full_name plus the channel identifier (Telegram numeric id / WhatsApp phone).
export interface BotUser {
  id: string
  full_name: string | null
  email: string
  telegram_user_id: number | null
  whatsapp_id: string | null
  phone_number: string | null
  created_at: string
}

export function useAdminBotUsers(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['admin-bot-users', page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('profiles')
        .select('id, full_name, email, telegram_user_id, whatsapp_id, phone_number, created_at', { count: 'exact' })
        .or('telegram_user_id.not.is.null,whatsapp_id.not.is.null')
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (error) throw error
      return { users: (data ?? []) as BotUser[], total: count ?? 0 }
    },
    staleTime: 1000 * 60,
  })
}

export function useAdminUpdateUser() {
  const qc = useQueryClient()

  return useMutation({
    // Balance is intentionally excluded — it must go through useAdminAdjustBalance
    // so every change is written to the transactions ledger.
    mutationFn: async ({
      userId,
      updates,
    }: {
      userId: string
      updates: Partial<Pick<Profile, 'role' | 'is_active'>> & { referral_code?: string }
    }) => {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}

// Adjusts a user's balance through an audited edge function. `amount` is a
// signed delta (positive to credit, negative to debit); the server records an
// `admin_adjustment` transaction tagging the acting admin.
export function useAdminAdjustBalance() {
  const { session } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, amount, note }: { userId: string; amount: number; note?: string }) => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-adjust-balance`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session!.access_token}`,
          },
          body: JSON.stringify({ user_id: userId, amount, note }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Adjustment failed')
      return data as { success: boolean; new_balance: number; applied: number }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useAdminAllOrders(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['admin-orders', page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('orders')
        .select('*, services(id, name), profiles(email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (error) throw error
      return { orders: data, total: count ?? 0 }
    },
  })
}

export function useAdminPendingDeposits() {
  return useQuery({
    queryKey: ['admin-pending-deposits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposit_requests')
        .select('*, profiles(email, full_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  })
}

export function useAdminAllDeposits(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['admin-all-deposits', page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('deposit_requests')
        .select('*, profiles(email, full_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (error) throw error
      return { deposits: data as (DepositRequest & { profiles: { email: string; full_name: string | null } | null })[], total: count ?? 0 }
    },
  })
}

export function useAdminApproveDeposit() {
  const { session } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      depositId,
      action,
      adminNote,
    }: {
      depositId: string
      action: 'approve' | 'reject'
      adminNote?: string
    }) => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-funds-manual`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session!.access_token}`,
          },
          body: JSON.stringify({ deposit_request_id: depositId, action, admin_note: adminNote }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pending-deposits'] })
      qc.invalidateQueries({ queryKey: ['admin-all-deposits'] })
    },
  })
}

export function useAdminSyncServices() {
  const { session } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-services`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session!.access_token}`,
          },
          body: '{}',
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      return data as { synced: number; categories_created: number }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['admin-services'] })
    },
  })
}

export function useAdminServices(page = 1, pageSize = 50) {
  return useQuery({
    queryKey: ['admin-services', page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('services')
        .select('*, categories(id, name)', { count: 'exact' })
        .order('exobooster_id')
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (error) throw error
      return { services: data, total: count ?? 0 }
    },
  })
}

export function useAdminToggleService() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ serviceId, isActive }: { serviceId: number; isActive: boolean }) => {
      const { error } = await supabase
        .from('services')
        .update({ is_active: isActive })
        .eq('id', serviceId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-services'] })
      qc.invalidateQueries({ queryKey: ['services'] })
    },
  })
}

export function useAdminUpdateServiceRate() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ serviceId, rate }: { serviceId: number; rate: number }) => {
      const { error } = await supabase
        .from('services')
        .update({ rate })
        .eq('id', serviceId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-services'] })
      qc.invalidateQueries({ queryKey: ['services'] })
    },
  })
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [usersRes, ordersRes, depositsRes, revenueRes, telegramRes, whatsappRes, botRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
        supabase.from('deposit_requests').select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase.from('transactions').select('amount').eq('type', 'deposit').eq('status', 'completed'),
        // Bot users = profiles reachable on a chat channel. Counted separately per
        // channel plus a combined count (a user linked on both would double-count if summed).
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .not('telegram_user_id', 'is', null),
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .not('whatsapp_id', 'is', null),
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .or('telegram_user_id.not.is.null,whatsapp_id.not.is.null'),
      ])

      return {
        total_users: usersRes.count ?? 0,
        orders_today: ordersRes.count ?? 0,
        pending_deposits: depositsRes.count ?? 0,
        total_revenue: revenueRes.data?.reduce((s, t) => s + t.amount, 0) ?? 0,
        telegram_users: telegramRes.count ?? 0,
        whatsapp_users: whatsappRes.count ?? 0,
        bot_users: botRes.count ?? 0,
      }
    },
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60 * 5,
  })
}

export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*')
      if (error) throw error
      const settings: Record<string, unknown> = {}
      data.forEach(s => { settings[s.key] = s.value })
      return settings
    },
  })
}

export function useAdminUpdateSetting() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ value })
        .eq('key', key)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
    },
  })
}
