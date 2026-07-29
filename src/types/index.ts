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
export type ComboPackage = Database['public']['Tables']['combo_packages']['Row']
export type ComboItem = Database['public']['Tables']['combo_items']['Row']

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

// ── Algorithm Booster (combo deals) ──────────────────────────
export const COMBO_COMPONENTS = ['followers', 'views', 'likes', 'shares', 'saves'] as const
export type ComboComponent = typeof COMBO_COMPONENTS[number]

// Components delivered to a profile link; everything else uses a post link
export const PROFILE_LINK_COMPONENTS: ReadonlySet<ComboComponent> = new Set<ComboComponent>(['followers'])

export const COMBO_COMPONENT_LABELS: Record<ComboComponent, string> = {
  followers: 'Followers',
  views: 'Views',
  likes: 'Likes',
  shares: 'Shares',
  saves: 'Saves',
}

export interface ComboItemWithService extends ComboItem {
  services: Pick<Service, 'id' | 'name' | 'type' | 'rate' | 'min_quantity' | 'max_quantity'> | null
}

export interface ComboWithItems extends ComboPackage {
  combo_items: ComboItemWithService[]
}

export interface PlaceComboPayload {
  combo_id: string
  profile_link?: string
  post_link?: string
}

export interface ComboOrderResult {
  component: string
  order_id: string | null
  exobooster_order_id: number | null
  status: string
  error?: string
}

export interface PlaceComboResponse {
  success?: boolean
  combo_group_id?: string
  results?: ComboOrderResult[]
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
