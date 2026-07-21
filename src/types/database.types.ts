export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: 'user' | 'merchant' | 'admin'
          balance: number
          api_key: string
          total_spent: number
          is_active: boolean
          merchant_id: string | null
          referral_code: string | null
          telegram_user_id: number | null
          phone_number: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: 'user' | 'merchant' | 'admin'
          balance?: number
          api_key?: string
          total_spent?: number
          is_active?: boolean
          merchant_id?: string | null
          referral_code?: string | null
          telegram_user_id?: number | null
          phone_number?: string | null
        }
        Update: {
          full_name?: string | null
          role?: 'user' | 'merchant' | 'admin'
          balance?: number
          total_spent?: number
          is_active?: boolean
          merchant_id?: string | null
          referral_code?: string | null
          telegram_user_id?: number | null
          phone_number?: string | null
        }
      }
      categories: {
        Row: {
          id: number
          name: string
          slug: string
          icon: string | null
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          name: string
          slug: string
          icon?: string | null
          sort_order?: number
          is_active?: boolean
        }
        Update: {
          name?: string
          slug?: string
          icon?: string | null
          sort_order?: number
          is_active?: boolean
        }
      }
      services: {
        Row: {
          id: number
          exobooster_id: number
          category_id: number | null
          name: string
          type: string | null
          rate: number
          min_quantity: number
          max_quantity: number
          description: string | null
          is_active: boolean
          refill: boolean
          cancel: boolean
          last_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          exobooster_id: number
          category_id?: number | null
          name: string
          type?: string | null
          rate: number
          min_quantity: number
          max_quantity: number
          description?: string | null
          is_active?: boolean
          refill?: boolean
          cancel?: boolean
        }
        Update: {
          category_id?: number | null
          name?: string
          type?: string | null
          rate?: number
          min_quantity?: number
          max_quantity?: number
          description?: string | null
          is_active?: boolean
          refill?: boolean
          cancel?: boolean
          last_synced_at?: string | null
        }
      }
      orders: {
        Row: {
          id: string
          user_id: string
          service_id: number
          exobooster_order_id: number | null
          link: string
          quantity: number
          charge: number
          start_count: number | null
          remains: number | null
          status: OrderStatus
          error_message: string | null
          created_at: string
          updated_at: string
          is_drip_feed: boolean
          drip_quantity: number | null
          drip_interval: number | null
          drip_runs_total: number | null
          drip_runs_done: number
          drip_next_run_at: string | null
          combo_group_id: string | null
          combo_label: string | null
        }
        Insert: {
          user_id: string
          service_id: number
          link: string
          quantity: number
          charge: number
          status?: OrderStatus
          combo_group_id?: string | null
          combo_label?: string | null
        }
        Update: {
          exobooster_order_id?: number | null
          start_count?: number | null
          remains?: number | null
          status?: OrderStatus
          error_message?: string | null
        }
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          type: TransactionType
          amount: number
          balance_before: number
          balance_after: number
          reference_id: string | null
          description: string | null
          status: 'pending' | 'completed' | 'failed'
          created_at: string
        }
        Insert: {
          user_id: string
          type: TransactionType
          amount: number
          balance_before: number
          balance_after: number
          reference_id?: string | null
          description?: string | null
          status?: 'pending' | 'completed' | 'failed'
        }
        Update: {
          status?: 'pending' | 'completed' | 'failed'
        }
      }
      deposit_requests: {
        Row: {
          id: string
          user_id: string
          amount: number
          method: string
          flw_tx_id: string | null
          flw_tx_ref: string | null
          status: DepositStatus
          admin_note: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          amount: number
          method?: string
          flw_tx_id?: string | null
          flw_tx_ref?: string | null
          status?: DepositStatus
        }
        Update: {
          flw_tx_id?: string | null
          status?: DepositStatus
          admin_note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
      }
      app_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          value?: Json
        }
      }
      combo_packages: {
        Row: {
          id: string
          platform: string
          name: string
          description: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          platform: string
          name: string
          description?: string | null
          sort_order?: number
          is_active?: boolean
        }
        Update: {
          platform?: string
          name?: string
          description?: string | null
          sort_order?: number
          is_active?: boolean
          updated_at?: string
        }
      }
      combo_items: {
        Row: {
          id: string
          combo_id: string
          component: string
          service_id: number
          quantity: number
          created_at: string
        }
        Insert: {
          combo_id: string
          component: string
          service_id: number
          quantity: number
        }
        Update: {
          component?: string
          service_id?: number
          quantity?: number
        }
      }
    }
  }
}

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'cancelled'
  | 'error'

export type TransactionType = 'deposit' | 'order_charge' | 'refund' | 'admin_adjustment' | 'merchant_commission'
export type DepositStatus = 'pending' | 'approved' | 'rejected' | 'failed'
