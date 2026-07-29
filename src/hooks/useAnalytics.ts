import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AnalyticsSummary {
  total_revenue: number
  total_users: number
  total_orders: number
  total_spent: number
  total_balance: number
  active_users_30d: number
  orders_30d: number
}

export interface RevenuePoint {
  day: string
  revenue: number
  spend: number
  orders: number
  active_users: number
}

export interface TopService {
  service_id: number
  name: string
  order_count: number
  total_quantity: number
  revenue: number
}

export interface TopUser {
  user_id: string
  email: string
  full_name: string | null
  total_spent: number
  balance: number
  order_count: number
}

export interface FreqBucket {
  bucket: string
  sort_order: number
  users: number
}

export interface AnalyticsData {
  summary: AnalyticsSummary
  timeseries: RevenuePoint[]
  topServices: TopService[]
  topUsers: TopUser[]
  frequency: FreqBucket[]
}

/**
 * All admin analytics in a single cached burst. Aggregation happens in Postgres
 * (admin-gated RPCs), so payloads stay tiny. Cached for 5 min with no polling —
 * this never runs for non-admins and never touches the hot path of the app.
 */
export function useAnalytics(days = 30) {
  return useQuery<AnalyticsData>({
    queryKey: ['admin-analytics', days],
    queryFn: async () => {
      const [summary, timeseries, services, users, frequency] = await Promise.all([
        supabase.rpc('admin_analytics_summary'),
        supabase.rpc('admin_revenue_timeseries', { p_days: days }),
        supabase.rpc('admin_top_services', { p_limit: 8 }),
        supabase.rpc('admin_top_users', { p_limit: 10 }),
        supabase.rpc('admin_user_frequency'),
      ])

      const err =
        summary.error || timeseries.error || services.error || users.error || frequency.error
      if (err) throw err

      return {
        summary: summary.data as AnalyticsSummary,
        timeseries: (timeseries.data ?? []) as RevenuePoint[],
        topServices: (services.data ?? []) as TopService[],
        topUsers: (users.data ?? []) as TopUser[],
        frequency: (frequency.data ?? []) as FreqBucket[],
      }
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  })
}
