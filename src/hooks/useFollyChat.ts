import { supabase } from '@/lib/supabase'

export interface FollyBtn { id: string; title: string; url?: string }

export interface FollyPending {
  service_id: number
  service_name: string
  link: string
  quantity: number
  charge: number
}

export interface FollyFlow {
  step: 'await_link' | 'await_qty'
  service_id: number
  service_name: string
  rate: number
  min: number
  max: number
  link?: string
  attempts?: number
  quantity?: number
}

export interface FollyResult {
  reply: string
  buttons: FollyBtn[][] | null
  flow: FollyFlow | null
  pending: FollyPending | null
  currency?: string
  order_placed?: boolean
}

export async function follyChat(params: {
  message?: string
  button_id?: string
  history: { role: 'user' | 'model'; text: string }[]
  flow: FollyFlow | null
  pending: FollyPending | null
}): Promise<FollyResult> {
  const { data, error } = await supabase.functions.invoke('folly-chat', { body: params })
  if (error) throw error
  return data as FollyResult
}
