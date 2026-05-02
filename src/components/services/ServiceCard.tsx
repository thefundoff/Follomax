import { motion } from 'framer-motion'
import { ArrowRight, RefreshCw, XCircle } from 'lucide-react'
import { formatCurrency, formatNumber, getPlatformIcon } from '@/lib/utils'
import type { ServiceWithCategory } from '@/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

interface ServiceCardProps {
  service: ServiceWithCategory
  isSelected?: boolean
  onSelect: (service: ServiceWithCategory) => void
}

export function ServiceCard({ service, isSelected, onSelect }: ServiceCardProps) {
  const platformIcon = service.categories?.icon || getPlatformIcon(service.name)
  const ratePerK = formatCurrency(service.rate)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'glass-card rounded-xl p-4 cursor-pointer transition-all duration-200',
        isSelected
          ? 'border-brand-500/60 ring-1 ring-brand-500/30 shadow-brand'
          : 'hover:border-brand-500/25 hover:shadow-glow'
      )}
      onClick={() => onSelect(service)}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-navy-600 flex items-center justify-center text-xl flex-shrink-0">
          {platformIcon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium text-white leading-tight line-clamp-2">{service.name}</h3>
            {isSelected && (
              <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
                <ArrowRight className="w-3 h-3 text-white" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {service.type && (
              <Badge variant="brand" size="sm">{service.type}</Badge>
            )}
            {service.refill && (
              <span className="inline-flex items-center gap-1 text-xs text-green-400">
                <RefreshCw className="w-3 h-3" /> Refill
              </span>
            )}
            {service.cancel && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-400">
                <XCircle className="w-3 h-3" /> Cancel
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div>
              <p className="text-xs text-gray-500">Rate per 1K</p>
              <p className="text-base font-bold text-brand-300">{ratePerK}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Min / Max</p>
              <p className="text-xs font-medium text-gray-300">
                {formatNumber(service.min_quantity)} / {formatNumber(service.max_quantity)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Button
        variant={isSelected ? 'primary' : 'secondary'}
        size="sm"
        className="w-full mt-3"
        onClick={e => { e.stopPropagation(); onSelect(service) }}
      >
        {isSelected ? 'Selected ✓' : 'Select Service'}
      </Button>
    </motion.div>
  )
}
