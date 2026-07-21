import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AiStatus {
  provider?: string
  configured: boolean
  model: string
  live: boolean
  ok?: boolean
  status?: number
  latency_ms?: number
  retry_after_seconds?: number | null
  last_ok?: { at: string } | null
  last_error?: { status: number; at: string } | null
  message?: string
}

// Cheap, pollable read — derives health from the bot's recorded traffic (no AI usage).
export function useAiStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-status', { body: { live: false } })
      if (error) throw error
      return data as AiStatus
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

// On-demand live ping (costs one tiny AI request) for the "Test now" button.
export function useAiStatusLiveTest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-status', { body: { live: true } })
      if (error) throw error
      return data as AiStatus
    },
    onSuccess: (data) => qc.setQueryData(['ai-status'], data),
  })
}
