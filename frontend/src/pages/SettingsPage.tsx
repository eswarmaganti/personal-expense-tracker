import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2, Check, X, User, Receipt, CalendarRange, Save } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { categoryDotColor, categoryColorById } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

import { settingsApi, dashboardApi, type CategoryOut, type CategoryBudgetOut, type FixedExpenseOut, type BillingCycleOut, type BillingCycleSettingsOut } from '@/api/api'
import {
  fixedExpenseSchema,
  profileSchema,
  changePasswordSchema,
  type CategoryInput,
  type PaymentMethodInput,
  type FixedExpenseInput,
  type SettingsInput,
  type ProfileInput,
  type ChangePasswordInput,
} from '@/lib/validations/schemas'
import { authApi } from '@/api/api'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

// ── Reusable inline-edit list (chips style) ───────────────────────────────────

function InlineList<T extends { id: number; name: string }>({
  items,
  onCreate,
  onUpdate,
  onDelete,
  placeholder,
  showColorSwatch = false,
}: {
  items: T[]
  onCreate: (name: string) => void
  onUpdate: (id: number, name: string) => void
  onDelete: (id: number) => void
  placeholder: string
  /** When true, shows a color swatch dot and badge preview next to each item name */
  showColorSwatch?: boolean
}) {
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  return (
    <div className="space-y-2">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto] gap-2 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Name</span>
        <span>Actions</span>
      </div>

      {/* Rows */}
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/40 transition-colors">
          {editId === item.id ? (
            <>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-sm" autoFocus />
              <div className="flex gap-1.5">
                <button onClick={() => { onUpdate(item.id, editName); setEditId(null) }} className="text-primary hover:text-primary/80"><Check className="h-4 w-4" /></button>
                <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0">
                {showColorSwatch && (
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryDotColor(item.id) }}
                    title="Category color"
                  />
                )}
                {showColorSwatch ? (
                  <Badge className={cn('border-0 text-xs', categoryColorById(item.id))}>
                    {item.name}
                  </Badge>
                ) : (
                  <span className="text-sm">{item.name}</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => { setEditId(item.id); setEditName(item.name) }} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => setConfirmDeleteId(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </>
          )}
        </div>
      ))}

      {/* Total count row */}
      <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
        <span>{items.length} {items.length === 1 ? 'record' : 'records'}</span>
      </div>

      {/* Add new */}
      <div className="flex gap-2 pt-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { onCreate(newName.trim()); setNewName('') } }}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button size="sm" onClick={() => { if (newName.trim()) { onCreate(newName.trim()); setNewName('') } }}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {confirmDeleteId !== null && (
        <ConfirmDialog
          message="This item will be permanently deleted."
          onConfirm={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null) }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

// ── Fixed expenses table ──────────────────────────────────────────────────────

function FixedExpensesTable({
  fixedExpenses,
  categories,
  paymentMethods,
  onDelete,
  onAdd,
}: {
  fixedExpenses: FixedExpenseOut[]
  categories: { id: number; name: string }[]
  paymentMethods: { id: number; name: string }[]
  onDelete: (id: number) => void
  onAdd: (data: FixedExpenseInput) => void
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const feForm = useForm<FixedExpenseInput>({ resolver: zodResolver(fixedExpenseSchema) })
  const total = fixedExpenses.reduce((s, fe) => s + fe.amount, 0)

  return (
    <div className="space-y-3">
      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-semibold text-muted-foreground">#</th>
              <th className="px-3 py-2 font-semibold text-muted-foreground">Description</th>
              <th className="px-3 py-2 font-semibold text-muted-foreground">Category</th>
              <th className="px-3 py-2 font-semibold text-muted-foreground">Payment Method</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Amount</th>
              <th className="px-3 py-2 font-semibold text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {fixedExpenses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No fixed expenses yet. Add one below.
                </td>
              </tr>
            )}
            {fixedExpenses.map((fe, idx) => (
              <tr key={fe.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-2 font-medium">{fe.description}</td>
                <td className="px-3 py-2">
                  {fe.category_id != null && fe.category_name ? (
                    <Badge className={cn('border-0 text-xs', categoryColorById(fe.category_id))}>
                      {fe.category_name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{fe.payment_method_name ?? <span className="text-amber-600 text-xs">⚠ Not set</span>}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatCurrency(fe.amount)}</td>
                <td className="px-3 py-2">
                  <button onClick={() => setConfirmDeleteId(fe.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {/* Total row */}
          {fixedExpenses.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/50">
                <td colSpan={4} className="px-3 py-2 font-semibold">
                  Total ({fixedExpenses.length} items)
                </td>
                <td className="px-3 py-2 text-right font-bold text-primary">{formatCurrency(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add form */}
      <form
        onSubmit={feForm.handleSubmit((d) => { onAdd(d); feForm.reset() })}
        className="space-y-3 rounded-md border bg-muted/20 p-3"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add Fixed Expense</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 lg:col-span-1">
            <Label className="text-xs">Description</Label>
            <Input placeholder="e.g. Rent" {...feForm.register('description')} />
            {feForm.formState.errors.description && (
              <p className="text-xs text-destructive">{feForm.formState.errors.description.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount (₹)</Label>
            <Input type="number" step="0.01" placeholder="0.00" {...feForm.register('amount')} />
            {feForm.formState.errors.amount && (
              <p className="text-xs text-destructive">{feForm.formState.errors.amount.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select {...feForm.register('category_id')}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payment Method</Label>
            <Select {...feForm.register('payment_method_id')}>
              <option value="">No payment method</option>
              {paymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Fixed expenses with both a category and payment method are automatically posted to your expense records at the start of each billing cycle.
        </p>
        <Button type="submit" size="sm" disabled={feForm.formState.isSubmitting}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </form>

      {confirmDeleteId !== null && (
        <ConfirmDialog
          message="This fixed expense will be permanently deleted."
          onConfirm={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null) }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

// ── Category + Budget table ───────────────────────────────────────────────────

function CategoryBudgetTable({
  categories,
  budgets,
  billingCycles,
  selectedCycle,
  onCycleChange,
  onBudgetSave,
  onCreate,
  onUpdate,
  onDelete,
}: {
  categories: CategoryOut[]
  budgets: CategoryBudgetOut[]
  billingCycles: BillingCycleOut[]
  selectedCycle: string
  onCycleChange: (c: string) => void
  onBudgetSave: (categoryId: number, limitAmount: number) => void
  onCreate: (name: string) => void
  onUpdate: (id: number, name: string) => void
  onDelete: (id: number) => void
}) {
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editBudget, setEditBudget] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')

  const budgetMap: Record<number, number> = {}
  for (const b of budgets) {
    budgetMap[b.category_id] = b.limit_amount
  }

  function startEdit(item: CategoryOut) {
    setEditId(item.id)
    setEditName(item.name)
    setEditBudget(String(budgetMap[item.id] ?? 0))
  }

  function cancelEdit() {
    setEditId(null)
  }

  return (
    <div className="space-y-3">
      {/* Cycle selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Billing Cycle:</span>
        <Select
          value={selectedCycle}
          onChange={(e) => onCycleChange(e.target.value)}
          className="w-auto"
        >
          {billingCycles.map((c) => (
            <option key={c.start_date} value={c.start_date}>{c.label}</option>
          ))}
        </Select>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Name</span>
        <span className="text-right pr-1">Budget (₹)</span>
        <span />
        <span>Actions</span>
      </div>

      {/* Rows */}
      {categories.map((item) => {
        const isEditing = editId === item.id
        const budgetAmt = budgetMap[item.id] ?? 0

        if (isEditing) {
          return (
            <div key={item.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-md px-1 py-1 bg-muted/40">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-sm" autoFocus placeholder="Category name" />
              <Input
                type="number"
                min={0}
                step="1"
                value={editBudget}
                onChange={(e) => setEditBudget(e.target.value)}
                className="h-7 w-28 text-sm text-right"
                placeholder="Budget"
              />
              <span className="text-xs text-muted-foreground">₹</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    onUpdate(item.id, editName)
                    onBudgetSave(item.id, parseFloat(editBudget) || 0)
                    cancelEdit()
                  }}
                  className="text-primary hover:text-primary/80"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        }

        return (
          <div key={item.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: categoryDotColor(item.id) }}
                title="Category color"
              />
              <Badge className={`border-0 text-xs ${categoryColorById(item.id)}`}>{item.name}</Badge>
            </div>
            <span className="text-sm text-right tabular-nums">
              {budgetAmt > 0 ? formatCurrency(budgetAmt) : <span className="text-muted-foreground">—</span>}
            </span>
            <span />
            <div className="flex gap-1.5">
              <button onClick={() => startEdit(item)} className="text-muted-foreground hover:text-foreground" title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setConfirmDeleteId(item.id)} className="text-muted-foreground hover:text-destructive" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      })}

      {/* Total count row */}
      <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
        <span>{categories.length} {categories.length === 1 ? 'record' : 'records'}</span>
      </div>

      {/* Add new */}
      <div className="flex gap-2 pt-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { onCreate(newName.trim()); setNewName('') } }}
          placeholder="New category…"
          className="flex-1"
        />
        <Button size="sm" onClick={() => { if (newName.trim()) { onCreate(newName.trim()); setNewName('') } }}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {confirmDeleteId !== null && (
        <ConfirmDialog
          message="This item will be permanently deleted."
          onConfirm={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null) }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

// ── Billing Cycles management table ──────────────────────────────────────────

function BillingCyclesTable({
  cycles,
  currentCycleStart,
  onUpdate,
  onDelete,
}: {
  cycles: BillingCycleSettingsOut[]
  currentCycleStart: string
  onUpdate: (cycleStart: string, data: { billing_cycle_start_day: number; monthly_salary: number }) => void
  onDelete: (cycleStart: string) => void
}) {
  const [editCycle, setEditCycle] = useState<string | null>(null)
  const [editStartDay, setEditStartDay] = useState(1)
  const [editSalary, setEditSalary] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function startEdit(c: BillingCycleSettingsOut) {
    setEditCycle(c.cycle_start)
    setEditStartDay(c.billing_cycle_start_day)
    setEditSalary(c.monthly_salary)
  }

  function cancelEdit() { setEditCycle(null) }

  function formatCycleLabel(cycleStart: string) {
    const d = new Date(cycleStart + 'T00:00:00')
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-semibold text-muted-foreground">Cycle</th>
              <th className="px-3 py-2 font-semibold text-muted-foreground">Start Day</th>
              <th className="px-3 py-2 font-semibold text-muted-foreground">Monthly Salary (₹)</th>
              <th className="px-3 py-2 font-semibold text-muted-foreground">Status</th>
              <th className="px-3 py-2 font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cycles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No billing cycles yet.
                </td>
              </tr>
            )}
            {cycles.map((c) => {
              const isCurrent = c.cycle_start === currentCycleStart
              const isEditing = editCycle === c.cycle_start
              return (
                <tr key={c.cycle_start} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-medium">
                    {formatCycleLabel(c.cycle_start)}
                    <span className="ml-1.5 text-xs text-muted-foreground">{c.cycle_start}</span>
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        type="number" min={1} max={28}
                        value={editStartDay}
                        onChange={e => setEditStartDay(Number(e.target.value))}
                        className="w-16 rounded border px-2 py-1 text-sm bg-background"
                      />
                    ) : (
                      <span>{c.billing_cycle_start_day}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        type="number" min={0} step="0.01"
                        value={editSalary}
                        onChange={e => setEditSalary(Number(e.target.value))}
                        className="w-32 rounded border px-2 py-1 text-sm bg-background"
                      />
                    ) : (
                      <span>₹{c.monthly_salary.toLocaleString('en-IN')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isCurrent ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Current
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Past</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { onUpdate(c.cycle_start, { billing_cycle_start_day: editStartDay, monthly_salary: editSalary }); cancelEdit() }}
                          className="text-primary hover:text-primary/80" title="Save"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground" title="Cancel">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <button onClick={() => startEdit(c)} className="text-muted-foreground hover:text-foreground" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => !isCurrent && setConfirmDelete(c.cycle_start)}
                          disabled={isCurrent}
                          title={isCurrent ? 'Cannot delete the active cycle' : 'Delete cycle'}
                          className={isCurrent ? 'text-muted-foreground/30 cursor-not-allowed' : 'text-muted-foreground hover:text-destructive'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {confirmDelete !== null && (
        <ConfirmDialog
          message={`Delete the ${formatCycleLabel(confirmDelete)} (${confirmDelete}) billing cycle? This cannot be undone.`}
          onConfirm={() => { onDelete(confirmDelete); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ── Tab nav ───────────────────────────────────────────────────────────────────

type Tab = 'expense' | 'user'

function TabNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'expense', label: 'Expense Settings', icon: Receipt },
    { id: 'user', label: 'User Settings', icon: User },
  ]
  return (
    <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            active === id
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Settings page ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const qc = useQueryClient()
  const { user, setUser } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('expense')

  const { data: billingCycles = [] } = useQuery<BillingCycleOut[]>({
    queryKey: ['billing-cycles'],
    queryFn: dashboardApi.billingCycles,
  })

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: settingsApi.listCategories })
  const { data: paymentMethods = [] } = useQuery({ queryKey: ['payment-methods'], queryFn: settingsApi.listPaymentMethods })
  const { data: fixedExpenses = [] } = useQuery({ queryKey: ['fixed-expenses'], queryFn: settingsApi.listFixedExpenses })

  // ── Billing cycles list (for the management table) ────────────────────────
  const { data: allCycles = [] } = useQuery({
    queryKey: ['all-cycles'],
    queryFn: settingsApi.listCycles,
  })

  // ── Category mutations ────────────────────────────────────────────────────
  const createCat = useMutation({ mutationFn: settingsApi.createCategory, onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) })
  const updateCat = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CategoryInput }) => settingsApi.updateCategory(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
  const deleteCat = useMutation({ mutationFn: settingsApi.deleteCategory, onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) })

  // ── Payment method mutations ──────────────────────────────────────────────
  const createPm = useMutation({ mutationFn: settingsApi.createPaymentMethod, onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }) })
  const updatePm = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PaymentMethodInput }) => settingsApi.updatePaymentMethod(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }),
  })
  const deletePm = useMutation({ mutationFn: settingsApi.deletePaymentMethod, onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }) })

  // ── Fixed expense mutations ───────────────────────────────────────────────
  const createFe = useMutation({ mutationFn: settingsApi.createFixedExpense, onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-expenses'] }) })
  const deleteFe = useMutation({ mutationFn: settingsApi.deleteFixedExpense, onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-expenses'] }) })

  // ── Per-cycle budget settings mutation (called from BillingCyclesTable) ──
  const updateSettings = useMutation({
    mutationFn: ({ cycleStart, data }: { cycleStart: string; data: SettingsInput }) =>
      settingsApi.updateCycleSettings(cycleStart, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['cycle-settings', variables.cycleStart] })
      qc.invalidateQueries({ queryKey: ['all-cycles'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      qc.invalidateQueries({ queryKey: ['monthly-trend'] })
    },
  })
  const deleteCycle = useMutation({
    mutationFn: settingsApi.deleteCycle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-cycles'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      qc.invalidateQueries({ queryKey: ['monthly-trend'] })
    },
  })

  // ── Budget cycle selection + query ───────────────────────────────────────
  const [selectedBudgetCycle, setSelectedBudgetCycle] = useState('')

  useEffect(() => {
    if (!selectedBudgetCycle && billingCycles.length > 0) {
      const current = billingCycles.find(c => c.is_current)
      if (current) setSelectedBudgetCycle(current.start_date)
    }
  }, [billingCycles, selectedBudgetCycle])

  const { data: budgets } = useQuery({
    queryKey: ['budgets', selectedBudgetCycle],
    queryFn: () => settingsApi.getBudgets(selectedBudgetCycle),
    enabled: !!selectedBudgetCycle,
  })

  const upsertBudgetMutation = useMutation({
    mutationFn: ({ cycleStart, categoryId, data }: { cycleStart: string; categoryId: number; data: { limit_amount: number } }) =>
      settingsApi.upsertBudget(cycleStart, categoryId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['budgets', variables.cycleStart] })
    },
  })

  // ── Profile form ──────────────────────────────────────────────────────────
  const profileForm = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '', email: user?.email ?? '' },
  })
  const updateProfile = useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (data) => setUser(data),
  })

  // ── Password form ─────────────────────────────────────────────────────────
  const pwForm = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) })
  const changePassword = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: () => pwForm.reset(),
  })

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your preferences, categories, and financial data</p>
      </div>

      {/* Tab navigation */}
      <TabNav active={activeTab} onChange={setActiveTab} />

      {/* ── Expense Settings tab ──────────────────────────────────────────── */}
      {activeTab === 'expense' && (
        <div className="space-y-6">

          {/* Fixed Expenses — full-width table */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Fixed Expenses</CardTitle>
              <CardDescription>Recurring costs that are deducted from your salary each cycle (rent, subscriptions, EMIs, etc.)</CardDescription>
            </CardHeader>
            <CardContent>
              <FixedExpensesTable
                fixedExpenses={fixedExpenses}
                categories={categories}
                paymentMethods={paymentMethods}
                onDelete={(id) => deleteFe.mutate(id)}
                onAdd={(data) => createFe.mutate(data)}
              />
            </CardContent>
          </Card>

          {/* Categories + Payment Methods side by side */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Categories</CardTitle>
                <CardDescription>Classify your expenses</CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryBudgetTable
                  categories={categories}
                  budgets={budgets ?? []}
                  billingCycles={billingCycles}
                  selectedCycle={selectedBudgetCycle}
                  onCycleChange={setSelectedBudgetCycle}
                  onBudgetSave={(categoryId, limitAmount) =>
                    upsertBudgetMutation.mutate({ cycleStart: selectedBudgetCycle, categoryId, data: { limit_amount: limitAmount } })
                  }
                  onCreate={(name) => createCat.mutate({ name })}
                  onUpdate={(id, name) => updateCat.mutate({ id, data: { name } })}
                  onDelete={(id) => deleteCat.mutate(id)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>Credit cards, UPI, cash, etc.</CardDescription>
              </CardHeader>
              <CardContent>
                <InlineList
                  items={paymentMethods}
                  onCreate={(name) => createPm.mutate({ name })}
                  onUpdate={(id, name) => updatePm.mutate({ id, data: { name } })}
                  onDelete={(id) => deletePm.mutate(id)}
                  placeholder="New payment method…"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── User Settings tab ─────────────────────────────────────────────── */}
      {activeTab === 'user' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            {/* Budget & Billing Cycles */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4" />
                  Billing Cycles
                </CardTitle>
                <CardDescription>
                  Manage salary and billing cycle start day per cycle. Click the pencil to edit a row inline. The current active cycle cannot be deleted.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BillingCyclesTable
                  cycles={allCycles}
                  currentCycleStart={billingCycles.find(c => c.is_current)?.start_date ?? ''}
                  onUpdate={(cycleStart, data) =>
                    updateSettings.mutate({ cycleStart, data: { billing_cycle_start_day: data.billing_cycle_start_day, monthly_salary: data.monthly_salary } })
                  }
                  onDelete={(cycleStart) => deleteCycle.mutate(cycleStart)}
                />
              </CardContent>
            </Card>

            {/* Profile */}
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Update your display name and email address</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={profileForm.handleSubmit((d) => updateProfile.mutate(d))} className="space-y-4">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input {...profileForm.register('name')} />
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input type="email" {...profileForm.register('email')} />
                  </div>
                  {updateProfile.isSuccess && (
                    <p className="text-sm text-green-600">Profile updated.</p>
                  )}
                  <Button type="submit" disabled={updateProfile.isPending}>
                    {updateProfile.isPending ? 'Saving…' : 'Update Profile'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Change Password */}
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Keep your account secure with a strong password</CardDescription>
              </CardHeader>
              <CardContent className="max-w-md">
                <form onSubmit={pwForm.handleSubmit((d) => changePassword.mutate(d))} className="space-y-4">
                  <div className="space-y-1">
                    <Label>Current Password</Label>
                    <Input type="password" {...pwForm.register('current_password')} />
                    {pwForm.formState.errors.current_password && (
                      <p className="text-xs text-destructive">{pwForm.formState.errors.current_password.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>New Password</Label>
                    <Input type="password" {...pwForm.register('new_password')} />
                    {pwForm.formState.errors.new_password && (
                      <p className="text-xs text-destructive">{pwForm.formState.errors.new_password.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Confirm New Password</Label>
                    <Input type="password" {...pwForm.register('confirm_password')} />
                    {pwForm.formState.errors.confirm_password && (
                      <p className="text-xs text-destructive">{pwForm.formState.errors.confirm_password.message}</p>
                    )}
                  </div>
                  {changePassword.isError && (
                    <p className="text-sm text-destructive">Current password is incorrect.</p>
                  )}
                  {changePassword.isSuccess && (
                    <p className="text-sm text-green-600">Password changed successfully.</p>
                  )}
                  <Button type="submit" disabled={changePassword.isPending}>
                    {changePassword.isPending ? 'Saving…' : 'Change Password'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
