import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy')
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm')
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function formatNumber(num: number): string {
  const trim = (n: number) => parseFloat(n.toFixed(1)).toString()
  if (num >= 1_000_000) return `${trim(num / 1_000_000)}M`
  if (num >= 1_000) return `${trim(num / 1_000)}K`
  return num.toString()
}

export function calculateOrderCharge(quantity: number, rate: number): number {
  return (quantity / 1000) * rate
}

export function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url
  return url.substring(0, maxLen) + '...'
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getPlatformIcon(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('instagram')) return '📸'
  if (lower.includes('youtube')) return '▶️'
  if (lower.includes('tiktok')) return '🎵'
  if (lower.includes('twitter') || lower.includes('x ')) return '🐦'
  if (lower.includes('facebook')) return '👤'
  if (lower.includes('telegram')) return '✈️'
  if (lower.includes('spotify')) return '🎧'
  if (lower.includes('linkedin')) return '💼'
  if (lower.includes('snapchat')) return '👻'
  if (lower.includes('pinterest')) return '📌'
  if (lower.includes('twitch')) return '🎮'
  if (lower.includes('discord')) return '💬'
  return '📱'
}
