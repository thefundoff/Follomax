import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ServiceWithCategory, Category } from '@/types'

export function useServices(categoryId?: number, search?: string) {
  return useQuery({
    queryKey: ['services', categoryId, search],
    queryFn: async () => {
      let query = supabase
        .from('services')
        .select('*, categories(id, name, icon, slug)')
        .eq('is_active', true)
        .order('name')

      if (categoryId) query = query.eq('category_id', categoryId)
      if (search) query = query.ilike('name', `%${search}%`)

      const { data, error } = await query
      if (error) throw error
      return data as ServiceWithCategory[]
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useService(serviceId: number | null) {
  return useQuery({
    queryKey: ['service', serviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*, categories(id, name, icon, slug)')
        .eq('id', serviceId!)
        .single()
      if (error) throw error
      return data as ServiceWithCategory
    },
    enabled: !!serviceId,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data as Category[]
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function usePublicServices() {
  return useQuery({
    queryKey: ['public-services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*, categories(id, name, icon)')
        .eq('is_active', true)
        .order('rate')
        .limit(12)
      if (error) throw error
      return data as ServiceWithCategory[]
    },
    staleTime: 1000 * 60 * 5,
  })
}
