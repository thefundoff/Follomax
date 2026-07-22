import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'

interface StatsCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
  change?: string
  changePositive?: boolean
  subtitle?: string
  isLoading?: boolean
  delay?: number
}

export function StatsCard({
  label, value, icon: Icon, iconColor = 'text-brand-400', iconBg = 'bg-brand-500/15',
  change, changePositive = true, subtitle, isLoading, delay = 0,
}: StatsCardProps) {
  if (isLoading) {
    return (
      <div className="glass-card rounded-2xl p-4 md:p-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="glass-card rounded-2xl p-4 md:p-6"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs md:text-sm text-gray-400 font-medium">{label}</p>
          <p className="text-xl md:text-2xl font-bold text-white mt-1 tabular-nums">{value}</p>
          {change && (
            <p className={cn('text-xs mt-1.5 font-medium', changePositive ? 'text-green-400' : 'text-red-400')}>
              {changePositive ? '↑' : '↓'} {change}
            </p>
          )}
          {subtitle && (
            <p className="text-xs mt-1.5 font-medium text-gray-500">{subtitle}</p>
          )}
        </div>
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
      </div>
    </motion.div>
  )
}
