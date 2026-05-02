export type {
  Database,
  OrderStatus,
  TransactionType,
  DepositStatus,
  Json,
} from './database.types'

import type { Database, OrderStatus } from './database.types'

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Service = Database['public']['Tables']['services']['Row']
export type Order = Database['public']['Tables']['orders']['Row']
export type Transaction = Database['public']['Tables']['transactions']['Row']
export type DepositRequest = Database['public']['Tables']['deposit_requests']['Row']
export type AppSetting = Database['public']['Tables']['app_settings']['Row']

export interface ServiceWithCategory extends Service {
  categories: Category | null
}

export interface OrderWithService extends Order {
  services: Pick<Service, 'id' | 'name' | 'type'> & {
    categories: Pick<Category, 'id' | 'name' | 'icon'> | null
  } | null
}

export interface PlaceOrderPayload {
  service_id: number
  link: string
  quantity: number
  comments?: string        // newline-separated, for custom_comments services
  is_drip_feed?: boolean
  drip_quantity?: number
  drip_interval?: number
}

export interface PlaceOrderResponse {
  success: boolean
  order_id?: string
  exobooster_order_id?: number
  error?: string
}

export interface FlutterwaveConfig {
  public_key: string
  tx_ref: string
  amount: number
  currency: string
  customer: {
    email: string
    name: string
  }
  customizations: {
    title: string
    description: string
    logo?: string
  }
}

export interface AdminStats {
  total_users: number
  total_revenue: number
  orders_today: number
  pending_deposits: number
  active_orders: number
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  in_progress: 'In Progress',
  completed: 'Completed',
  partial: 'Partial',
  cancelled: 'Cancelled',
  error: 'Error',
}
