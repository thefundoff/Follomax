import { cn, getPlatformIcon } from '@/lib/utils'
import type { Category } from '@/types'
import { Skeleton } from '@/components/ui/Skeleton'

interface CategoryFilterProps {
  categories: Category[]
  selected: number | null
  onSelect: (id: number | null) => void
  isLoading?: boolean
}

export function CategoryFilter({ categories, selected, onSelect, isLoading }: CategoryFilterProps) {
  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 flex-shrink-0 rounded-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap flex-shrink-0',
          selected === null
            ? 'bg-brand-500 !text-white shadow-brand'
            : 'bg-navy-700 text-gray-400 hover:bg-navy-600 hover:text-gray-200 border border-navy-500'
        )}
      >
        🌐 All Services
      </button>

      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap flex-shrink-0',
            selected === cat.id
              ? 'bg-brand-500 !text-white shadow-brand'
              : 'bg-navy-700 text-gray-400 hover:bg-navy-600 hover:text-gray-200 border border-navy-500'
          )}
        >
          <span>{cat.icon || getPlatformIcon(cat.name)}</span>
          {cat.name}
        </button>
      ))}
    </div>
  )
}
