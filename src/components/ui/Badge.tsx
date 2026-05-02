import { cn } from '@/lib/utils'
import type { OrderStatus } from '@/types/database.types'
import { ORDER_STATUS_LABELS } from '@/types'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand' | 'purple'
  size?: 'sm' | 'md'
  className?: string
}

const variants = {
  default: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  success: 'bg-green-500/15 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  brand: 'bg-brand-500/15 text-brand-300 border-brand-500/30',
  purple: 'bg-brand-500/15 text-brand-300 border-brand-500/30',
}

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center font-medium rounded-full border',
      size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}

const statusVariants: Record<OrderStatus, BadgeProps['variant']> = {
  pending: 'warning',
  processing: 'info',
  in_progress: 'info',
  completed: 'success',
  partial: 'warning',
  cancelled: 'default',
  error: 'error',
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={statusVariants[status]}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  )
}
