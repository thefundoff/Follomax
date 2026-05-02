import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, Info } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { CategoryFilter } from '@/components/services/CategoryFilter'
import { OrderForm } from '@/components/services/OrderForm'
import { useServices, useCategories } from '@/hooks/useServices'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Card } from '@/components/ui/Card'
import { formatCurrency, formatNumber, getPlatformIcon } from '@/lib/utils'
import type { ServiceWithCategory } from '@/types'

export function NewOrderPage() {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [selectedService, setSelectedService] = useState<ServiceWithCategory | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const navigate = useNavigate()

  const { data: categories, isLoading: categoriesLoading } = useCategories()
  const { data: services, isLoading: servicesLoading } = useServices(
    selectedCategory || undefined,
    debouncedSearch || undefined
  )

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    clearTimeout((window as unknown as Record<string, ReturnType<typeof setTimeout>>)._searchTimeout)
    ;(window as unknown as Record<string, ReturnType<typeof setTimeout>>)._searchTimeout = setTimeout(() => {
      setDebouncedSearch(e.target.value)
    }, 300)
  }

  const filteredServices = useMemo(() => services ?? [], [services])

  const handleOrderPlaced = () => {
    setSelectedService(null)
    navigate('/orders')
  }

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value)
    setSelectedService(filteredServices.find(s => s.id === id) ?? null)
  }

  const platformIcon = selectedService
    ? selectedService.categories?.icon || getPlatformIcon(selectedService.name)
    : null

  return (
    <DashboardLayout title="New Order">
      <div className="max-w-screen-xl flex flex-col md:flex-row gap-6">

        {/* ── Left panel: filters + service selector ── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Category chips */}
          <CategoryFilter
            categories={categories || []}
            selected={selectedCategory}
            onSelect={cat => { setSelectedCategory(cat); setSelectedService(null) }}
            isLoading={categoriesLoading}
          />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search services..."
              className="input-field pl-10"
            />
          </div>

          {/* Service dropdown */}
          {servicesLoading ? (
            <TableSkeleton rows={3} />
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <select
                  value={selectedService?.id ?? ''}
                  onChange={handleServiceChange}
                  className="input-field w-full appearance-none pr-10 cursor-pointer"
                >
                  <option value="">— Select a service —</option>
                  {filteredServices.map(service => (
                    <option key={service.id} value={service.id}>
                      {service.name} — {formatCurrency(service.rate)}/1K
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>

              {/* Selected service info */}
              <AnimatePresence>
                {selectedService && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-xl bg-brand-500/10 border border-brand-500/20 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl flex-shrink-0">{platformIcon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white leading-snug">{selectedService.name}</p>
                        {selectedService.categories?.name && (
                          <p className="text-xs text-brand-400 mt-0.5">{selectedService.categories.name}</p>
                        )}
                        {selectedService.description && (
                          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-2">{selectedService.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2.5 text-xs">
                          <span className="bg-navy-600 rounded-lg px-2.5 py-1 text-gray-300">
                            Rate: <span className="text-white font-medium">{formatCurrency(selectedService.rate)}/1K</span>
                          </span>
                          <span className="bg-navy-600 rounded-lg px-2.5 py-1 text-gray-300">
                            Min: <span className="text-white font-medium">{formatNumber(selectedService.min_quantity)}</span>
                          </span>
                          <span className="bg-navy-600 rounded-lg px-2.5 py-1 text-gray-300">
                            Max: <span className="text-white font-medium">{formatNumber(selectedService.max_quantity)}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {filteredServices.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
                  <Info className="w-8 h-8 mb-2 text-gray-600" />
                  <p className="text-sm font-medium text-gray-400">No services found</p>
                  <p className="text-xs mt-1">Try a different category or search term</p>
                </div>
              )}
            </div>
          )}

          {/* Mobile: form stacks below */}
          <div className="md:hidden">
            <AnimatePresence mode="wait">
              {selectedService && (
                <motion.div
                  key={selectedService.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                >
                  <OrderForm service={selectedService} onOrderPlaced={handleOrderPlaced} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Right panel: order form (desktop only) ── */}
        <div className="hidden md:block w-80 flex-shrink-0 self-start sticky top-4">
          <AnimatePresence mode="wait">
            {selectedService ? (
              <OrderForm key={selectedService.id} service={selectedService} onOrderPlaced={handleOrderPlaced} />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Card>
                  <div className="flex flex-col items-center justify-center text-center py-10">
                    <div className="w-16 h-16 rounded-2xl bg-navy-700 flex items-center justify-center text-3xl mb-4">👆</div>
                    <p className="text-white font-semibold">Select a Service</p>
                    <p className="text-gray-500 text-sm mt-2 leading-relaxed">Choose a service from the dropdown to place an order</p>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </DashboardLayout>
  )
}
