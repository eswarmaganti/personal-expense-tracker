import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2, X, Check, Filter, XCircle } from 'lucide-react'

import { expensesApi, settingsApi, type ExpenseOut, type ExpenseFilters } from '@/api/api'
import { expenseSchema, type ExpenseInput } from '@/lib/validations/schemas'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns Tailwind classes for category badge based on name. */
function categoryBadgeClass(name: string): string {
  if (/invest/i.test(name)) {
    return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
  }
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
}

// ── Expense form modal ────────────────────────────────────────────────────────

function ExpenseFormModal({
  expense,
  onClose,
}: {
  expense?: ExpenseOut
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: settingsApi.listCategories })
  const { data: paymentMethods = [] } = useQuery({ queryKey: ['payment-methods'], queryFn: settingsApi.listPaymentMethods })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: expense
      ? {
          date: expense.date,
          description: expense.description,
          amount: expense.amount,
          category_id: expense.category_id,
          payment_method_id: expense.payment_method_id,
        }
      : { date: new Date().toISOString().slice(0, 10) },
  })

  const mutation = useMutation({
    mutationFn: (data: ExpenseInput) =>
      expense ? expensesApi.update(expense.id, data) : expensesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      qc.invalidateQueries({ queryKey: ['category-breakdown'] })
      qc.invalidateQueries({ queryKey: ['payment-breakdown'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{expense ? 'Edit Expense' : 'Add Expense'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" {...register('date')} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Amount (₹)</Label>
              <Input type="number" step="0.01" placeholder="0.00" {...register('amount')} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Input placeholder="e.g. Groceries from Flipkart" {...register('description')} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>Category</Label>
            <Select {...register('category_id')}>
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            {errors.category_id && <p className="text-xs text-destructive">{errors.category_id.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>Payment Method</Label>
            <Select {...register('payment_method_id')}>
              <option value="">Select payment method</option>
              {paymentMethods.map((pm) => (
                <option key={pm.id} value={pm.id}>{pm.name}</option>
              ))}
            </Select>
            {errors.payment_method_id && <p className="text-xs text-destructive">{errors.payment_method_id.message}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : expense ? 'Update' : 'Add Expense'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterState {
  start_date: string
  end_date: string
  category_id: string
  payment_method_id: string
}

const EMPTY_FILTERS: FilterState = {
  start_date: '',
  end_date: '',
  category_id: '',
  payment_method_id: '',
}

function FilterBar({
  filters,
  onChange,
  onClear,
  categories,
  paymentMethods,
}: {
  filters: FilterState
  onChange: (f: FilterState) => void
  onClear: () => void
  categories: { id: number; name: string }[]
  paymentMethods: { id: number; name: string }[]
}) {
  const hasActive = Object.values(filters).some(Boolean)

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Filters</span>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input
            type="date"
            value={filters.start_date}
            onChange={(e) => onChange({ ...filters, start_date: e.target.value })}
            className="h-9 w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input
            type="date"
            value={filters.end_date}
            onChange={(e) => onChange({ ...filters, end_date: e.target.value })}
            className="h-9 w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Category</label>
          <Select
            value={filters.category_id}
            onChange={(e) => onChange({ ...filters, category_id: e.target.value })}
            className="h-9 w-44"
          >
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Payment method</label>
          <Select
            value={filters.payment_method_id}
            onChange={(e) => onChange({ ...filters, payment_method_id: e.target.value })}
            className="h-9 w-44"
          >
            <option value="">All methods</option>
            {paymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
          </Select>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasActive}
          onClick={onClear}
          className="self-end h-9 gap-1.5"
        >
          <XCircle className="h-3.5 w-3.5" />
          Clear filters
        </Button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editExpense, setEditExpense] = useState<ExpenseOut | undefined>()
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: settingsApi.listCategories })
  const { data: paymentMethods = [] } = useQuery({ queryKey: ['payment-methods'], queryFn: settingsApi.listPaymentMethods })

  const queryFilters: ExpenseFilters = {
    page,
    page_size: 20,
    ...(filters.start_date && { start_date: filters.start_date }),
    ...(filters.end_date && { end_date: filters.end_date }),
    ...(filters.category_id && { category_id: Number(filters.category_id) }),
    ...(filters.payment_method_id && { payment_method_id: Number(filters.payment_method_id) }),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', queryFilters],
    queryFn: () => expensesApi.list(queryFilters),
  })

  const deleteMutation = useMutation({
    mutationFn: expensesApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })

  function handleFilterChange(next: FilterState) {
    setFilters(next)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Expenses</h1>
          <p className="text-muted-foreground">{data?.total ?? 0} total records</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Expense
        </Button>
      </div>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        onClear={() => handleFilterChange(EMPTY_FILTERS)}
        categories={categories}
        paymentMethods={paymentMethods}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Payment Method</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((exp) => (
                    <tr key={exp.id} className="border-b transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(exp.date)}</td>
                      <td className="px-4 py-3 font-medium">{exp.description}</td>
                      <td className="px-4 py-3">
                        <Badge className={cn('border-0', categoryBadgeClass(exp.category_name))}>
                          {exp.category_name}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{exp.payment_method_name}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(exp.amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditExpense(exp); setShowForm(true) }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(exp.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data?.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        No expenses found. {Object.values(filters).some(Boolean) ? 'Try adjusting your filters.' : 'Click "Add Expense" to get started.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {data.total_pages}</span>
          <Button variant="outline" size="sm" disabled={page === data.total_pages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}

      {(showForm || editExpense) && (
        <ExpenseFormModal
          expense={editExpense}
          onClose={() => { setShowForm(false); setEditExpense(undefined) }}
        />
      )}

      {confirmDeleteId !== null && (
        <ConfirmDialog
          message="This expense will be permanently deleted and cannot be recovered."
          onConfirm={() => { deleteMutation.mutate(confirmDeleteId); setConfirmDeleteId(null) }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}
