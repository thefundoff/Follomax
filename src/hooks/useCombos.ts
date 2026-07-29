import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { calculateOrderCharge } from '@/lib/utils'
import type {
  ComboWithItems,
  ComboComponent,
  PlaceComboPayload,
  PlaceComboResponse,
} from '@/types'

const COMBO_SELECT = `
  *,
  combo_items(
    id, combo_id, component, service_id, quantity, created_at,
    services(id, name, type, rate, min_quantity, max_quantity)
  )
`

/** Total price of a combo = sum of each item (quantity / 1000 * service.rate) */
export function comboPrice(combo: ComboWithItems): number {
  return (combo.combo_items || []).reduce((sum, item) => {
    const rate = item.services?.rate ?? 0
    return sum + calculateOrderCharge(item.quantity, rate)
  }, 0)
}

/** Active combos for a platform, ordered for display. Public/user-facing. */
export function useCombos(platform?: string) {
  return useQuery({
    queryKey: ['combos', platform ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('combo_packages')
        .select(COMBO_SELECT)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')

      if (platform) query = query.eq('platform', platform)

      const { data, error } = await query
      if (error) throw error
      return data as ComboWithItems[]
    },
    staleTime: 1000 * 60 * 5,
  })
}

/** All combos (incl. inactive) for the admin console. */
export function useAdminCombos() {
  return useQuery({
    queryKey: ['admin-combos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combo_packages')
        .select(COMBO_SELECT)
        .order('platform')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data as ComboWithItems[]
    },
    staleTime: 1000 * 30,
  })
}

export function usePlaceComboOrder() {
  const { session } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: PlaceComboPayload): Promise<PlaceComboResponse> => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/place-combo-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session!.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to place combo order')
      return data as PlaceComboResponse
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['recent-orders'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['balance'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

// ── Admin CRUD ────────────────────────────────────────────────

export interface ComboItemInput {
  component: ComboComponent
  service_id: number
  quantity: number
}

export interface SaveComboInput {
  id?: string
  platform: string
  name: string
  description?: string | null
  sort_order?: number
  is_active?: boolean
  items: ComboItemInput[]
}

export function useSaveCombo() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: SaveComboInput) => {
      const pkg = {
        platform: input.platform,
        name: input.name,
        description: input.description ?? null,
        sort_order: input.sort_order ?? 0,
        is_active: input.is_active ?? true,
      }

      let comboId = input.id

      if (comboId) {
        const { error } = await supabase
          .from('combo_packages')
          .update({ ...pkg, updated_at: new Date().toISOString() })
          .eq('id', comboId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('combo_packages')
          .insert(pkg)
          .select('id')
          .single()
        if (error) throw error
        comboId = (data as { id: string }).id
      }

      // Replace items wholesale
      const { error: delErr } = await supabase.from('combo_items').delete().eq('combo_id', comboId)
      if (delErr) throw delErr

      const rows = input.items
        .filter(i => i.service_id && i.quantity > 0)
        .map(i => ({ combo_id: comboId!, component: i.component, service_id: i.service_id, quantity: i.quantity }))

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('combo_items').insert(rows)
        if (insErr) throw insErr
      }

      return comboId!
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-combos'] })
      qc.invalidateQueries({ queryKey: ['combos'] })
    },
  })
}

export function useDeleteCombo() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (comboId: string) => {
      const { error } = await supabase.from('combo_packages').delete().eq('id', comboId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-combos'] })
      qc.invalidateQueries({ queryKey: ['combos'] })
    },
  })
}
