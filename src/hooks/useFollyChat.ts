import { supabase } from '@/lib/supabase'

export interface FollyPending {
  service_id: number
  service_name: string
  link: string
  quantity: number
  charge: number
}

export interface FollyMessageResult {
  reply: string
  pending: FollyPending | null
  currency?: string
}

export interface FollyPlaceResult {
  ok: boolean
  order_id?: string
  balance?: number
  currency?: string
  error?: string
  code?: string
}

export async function follySend(message: string, history: { role: 'user' | 'model'; text: string }[]): Promise<FollyMessageResult> {
  const { data, error } = await supabase.functions.invoke('folly-chat', { body: { action: 'message', message, history } })
  if (error) throw error
  return data as FollyMessageResult
}

export async function follyPlace(p: FollyPending): Promise<FollyPlaceResult> {
  const { data, error } = await supabase.functions.invoke('folly-chat', {
    body: { action: 'place', service_id: p.service_id, link: p.link, quantity: p.quantity },
  })
  if (error) throw error
  return data as FollyPlaceResult
}
