import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { useServices } from '@/hooks/useServices'
import {
  useAdminCombos, useSaveCombo, useDeleteCombo, comboPrice,
  type ComboItemInput,
} from '@/hooks/useCombos'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { COMBO_COMPONENTS, COMBO_COMPONENT_LABELS } from '@/types'
import type { ComboComponent, ComboWithItems } from '@/types'

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
]

type ComponentRow = { service_id: number | ''; quantity: number | '' }
type RowState = Record<ComboComponent, ComponentRow>

const emptyRows = (): RowState =>
  COMBO_COMPONENTS.reduce((acc, c) => {
    acc[c] = { service_id: '', quantity: '' }
    return acc
  }, {} as RowState)

interface FormState {
  id?: string
  platform: string
  name: string
  description: string
  sort_order: number
  is_active: boolean
  rows: RowState
}

function comboToForm(combo: ComboWithItems): FormState {
  const rows = emptyRows()
  for (const item of combo.combo_items) {
    if ((COMBO_COMPONENTS as readonly string[]).includes(item.component)) {
      rows[item.component as ComboComponent] = { service_id: item.service_id, quantity: item.quantity }
    }
  }
  return {
    id: combo.id,
    platform: combo.platform,
    name: combo.name,
    description: combo.description ?? '',
    sort_order: combo.sort_order,
    is_active: combo.is_active,
    rows,
  }
}

export function AdminCombosPage() {
  const [form, setForm] = useState<FormState | null>(null)

  const { data: combos, isLoading } = useAdminCombos()
  const { data: services } = useServices()
  const { mutateAsync: saveCombo, isPending: isSaving } = useSaveCombo()
  const { mutateAsync: deleteCombo } = useDeleteCombo()

  const activeServices = useMemo(
    () => (services ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [services]
  )

  const startNew = () =>
    setForm({ platform: 'instagram', name: '', description: '', sort_order: 0, is_active: true, rows: emptyRows() })

  const startEdit = (combo: ComboWithItems) => setForm(comboToForm(combo))

  const setRow = (component: ComboComponent, patch: Partial<ComponentRow>) =>
    setForm(f => (f ? { ...f, rows: { ...f.rows, [component]: { ...f.rows[component], ...patch } } } : f))

  const handleDelete = async (combo: ComboWithItems) => {
    if (!window.confirm(`Delete "${combo.platform} ${combo.name}"? This cannot be undone.`)) return
    try {
      await deleteCombo(combo.id)
      toast.success('Combo deleted')
    } catch {
      toast.error('Failed to delete combo')
    }
  }

  const handleSave = async () => {
    if (!form) return
    if (!form.name.trim()) { toast.error('Enter a name for the combo'); return }

    const items: ComboItemInput[] = COMBO_COMPONENTS
      .map(component => {
        const row = form.rows[component]
        const serviceId = Number(row.service_id)
        const quantity = Number(row.quantity)
        if (!serviceId || !quantity || quantity <= 0) return null
        return { component, service_id: serviceId, quantity }
      })
      .filter((x): x is ComboItemInput => x !== null)

    if (items.length === 0) { toast.error('Add at least one component with a service and quantity'); return }

    // Validate against service min/max
    for (const item of items) {
      const svc = activeServices.find(s => s.id === item.service_id)
      if (svc && (item.quantity < svc.min_quantity || item.quantity > svc.max_quantity)) {
        toast.error(`${COMBO_COMPONENT_LABELS[item.component]}: quantity must be ${svc.min_quantity}–${svc.max_quantity}`)
        return
      }
    }

    try {
      await saveCombo({
        id: form.id,
        platform: form.platform,
        name: form.name.trim(),
        description: form.description.trim() || null,
        sort_order: form.sort_order,
        is_active: form.is_active,
        items,
      })
      toast.success(form.id ? 'Combo updated' : 'Combo created')
      setForm(null)
    } catch {
      toast.error('Failed to save combo')
    }
  }

  // Live price preview for the form
  const formPrice = useMemo(() => {
    if (!form) return 0
    return COMBO_COMPONENTS.reduce((sum, component) => {
      const row = form.rows[component]
      const svc = activeServices.find(s => s.id === Number(row.service_id))
      const qty = Number(row.quantity)
      if (!svc || !qty) return sum
      return sum + (qty / 1000) * svc.rate
    }, 0)
  }, [form, activeServices])

  return (
    <AdminLayout title="Combo Deals">
      <div className="space-y-4">
        <Card padding="sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Algorithm Booster Packages</p>
              <p className="text-xs text-gray-400">{combos?.length ?? 0} combos configured</p>
            </div>
            {!form && (
              <Button leftIcon={<Plus className="w-4 h-4" />} onClick={startNew}>New Combo</Button>
            )}
          </div>
        </Card>

        {/* ── Editor ── */}
        {form && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">{form.id ? 'Edit Combo' : 'New Combo'}</p>
              <button onClick={() => setForm(null)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-navy-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-300">Platform</label>
                <select
                  value={form.platform}
                  onChange={e => setForm(f => f ? { ...f, platform: e.target.value } : f)}
                  className="input-field w-full"
                >
                  {PLATFORM_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <Input
                label="Tier name"
                placeholder="Growth"
                value={form.name}
                onChange={e => setForm(f => f ? { ...f, name: e.target.value } : f)}
              />
              <Input
                label="Description"
                placeholder="Balanced boost for growing accounts"
                value={form.description}
                onChange={e => setForm(f => f ? { ...f, description: e.target.value } : f)}
              />
              <Input
                label="Sort order"
                type="number"
                value={form.sort_order}
                onChange={e => setForm(f => f ? { ...f, sort_order: Number(e.target.value) } : f)}
              />
            </div>

            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm(f => f ? { ...f, is_active: e.target.checked } : f)}
                className="rounded border-navy-500 bg-navy-600 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-300">Active (visible to users)</span>
            </label>

            {/* Component rows */}
            <div className="space-y-2 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Components</p>
              <p className="text-xs text-gray-500">Leave a component blank to exclude it from this combo.</p>
              {COMBO_COMPONENTS.map(component => {
                const row = form.rows[component]
                const svc = activeServices.find(s => s.id === Number(row.service_id))
                return (
                  <div key={component} className="grid grid-cols-[90px_1fr_120px] gap-2 items-center">
                    <span className="text-sm text-gray-300">{COMBO_COMPONENT_LABELS[component]}</span>
                    <select
                      value={row.service_id}
                      onChange={e => setRow(component, { service_id: e.target.value ? Number(e.target.value) : '' })}
                      className="input-field w-full text-sm"
                    >
                      <option value="">— none —</option>
                      {activeServices.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({formatCurrency(s.rate)}/1K)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Qty"
                      value={row.quantity}
                      onChange={e => setRow(component, { quantity: e.target.value ? Number(e.target.value) : '' })}
                      className="input-field w-full text-sm"
                    />
                    {svc && Number(row.quantity) > 0 && (
                      <span className="col-start-2 col-span-2 text-xs text-gray-500 -mt-1">
                        Min {svc.min_quantity} / Max {svc.max_quantity}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-navy-500/40">
              <div>
                <span className="text-xs text-gray-500">Package price</span>
                <p className="text-lg font-bold text-white">{formatCurrency(formPrice)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
                <Button leftIcon={<Save className="w-4 h-4" />} onClick={handleSave} isLoading={isSaving}>
                  {form.id ? 'Save Changes' : 'Create Combo'}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── List ── */}
        <Card padding="none">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={5} /></div>
          ) : !combos || combos.length === 0 ? (
            <div className="p-10 text-center text-gray-500 text-sm">No combos yet. Create your first booster package.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-500/40">
                    {['Platform', 'Tier', 'Components', 'Price', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-500/20">
                  {combos.map(combo => (
                    <tr key={combo.id} className={`hover:bg-navy-700/30 transition-colors ${!combo.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-sm text-gray-300 capitalize">{combo.platform}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-white font-medium">{combo.name}</p>
                        {combo.description && <p className="text-xs text-gray-500 max-w-[220px] truncate">{combo.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {combo.combo_items.map(item => (
                            <span key={item.id} className="text-xs bg-navy-600 rounded-md px-2 py-0.5 text-gray-300 capitalize">
                              {item.component} {formatNumber(item.quantity)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-brand-300">{formatCurrency(comboPrice(combo))}</td>
                      <td className="px-4 py-3"><Badge variant={combo.is_active ? 'success' : 'default'}>{combo.is_active ? 'Active' : 'Hidden'}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(combo)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-brand-500/10">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(combo)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  )
}
