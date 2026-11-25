import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type Header,
  type Row,
  type Cell,
} from '@tanstack/react-table'
import {
  Plus, Pencil, Trash2, X, RefreshCw,
  ArrowUpDown, ArrowUp, ArrowDown,
  Filter, ChevronLeft, ChevronRight,
  Search,
} from 'lucide-react'

import {
  expensesApi, settingsApi, dashboardApi,
  type ExpenseOut, type ExpenseFilters, type BillingCycleOut, type FixedExpensesStatus,
} from '@/api/api'
import { expenseSchema, type ExpenseInput } from '@/lib/validations/schemas'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// ── Category badge colour ─────────────────────────────────────────────────────

function categoryColor(name: string): string {
  if (/invest/i.test(name)) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (/loan|emi/i.test(name)) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  if (/rent/i.test(name)) return 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
  return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
}

// ── Expense form modal ────────────────────────────────────────────────────────

function ExpenseFormModal({ expense, onClose }: { expense?: ExpenseOut; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: settingsApi.listCategories })
  const { data: paymentMethods = [] } = useQuery({ queryKey: ['payment-methods'], queryFn: settingsApi.listPaymentMethods })

  const { register, handleSubmit, formState: { errors } } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: expense
      ? { date: expense.date, description: expense.description, amount: expense.amount, category_id: expense.category_id, payment_method_id: expense.payment_method_id }
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
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
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
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {errors.category_id && <p className="text-xs text-destructive">{errors.category_id.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Payment Method</Label>
            <Select {...register('payment_method_id')}>
              <option value="">Select payment method</option>
              {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
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

// ── Page ──────────────────────────────────────────────────────────────────────

interface ServerFilters {
  description: string
  category_id: string
  payment_method_id: string
}
const EMPTY_FILTERS: ServerFilters = { description: '', category_id: '', payment_method_id: '' }

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

const colHelper = createColumnHelper<ExpenseOut>()

export default function ExpensesPage() {
  const qc = useQueryClient()

  // ── UI state ──────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [showForm, setShowForm] = useState(false)
  const [editExpense, setEditExpense] = useState<ExpenseOut | undefined>()
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])

  // Billing cycle
  const [selectedCycle, setSelectedCycle] = useState<string>('all')
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })

  // Server-side filters
  const [filters, setFilters] = useState<ServerFilters>(EMPTY_FILTERS)
  const [descInput, setDescInput] = useState('')  // raw input, debounced into filters.description

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: settingsApi.listCategories })
  const { data: paymentMethods = [] } = useQuery({ queryKey: ['payment-methods'], queryFn: settingsApi.listPaymentMethods })
  const { data: billingCycles = [] } = useQuery<BillingCycleOut[]>({
    queryKey: ['billing-cycles'],
    queryFn: dashboardApi.billingCycles,
  })

  // Default to current billing cycle
  useEffect(() => {
    if (billingCycles.length > 0) {
      const cur = billingCycles.find(c => c.is_current)
      if (cur) {
        setSelectedCycle(`${cur.start_date}|${cur.end_date}`)
        setDateRange({ start: cur.start_date, end: cur.end_date })
      }
    }
  }, [billingCycles])

  // Debounce description
  useEffect(() => {
    const t = setTimeout(() => setFilters(f => ({ ...f, description: descInput })), 300)
    return () => clearTimeout(t)
  }, [descInput])

  // Reset page on filter/page-size change
  useEffect(() => { setPage(1) }, [dateRange, filters, pageSize])

  const queryFilters: ExpenseFilters = {
    page,
    page_size: pageSize,
    ...(dateRange.start && { start_date: dateRange.start }),
    ...(dateRange.end && { end_date: dateRange.end }),
    ...(filters.category_id && { category_id: Number(filters.category_id) }),
    ...(filters.payment_method_id && { payment_method_id: Number(filters.payment_method_id) }),
    ...(filters.description && { description: filters.description }),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', queryFilters],
    queryFn: () => expensesApi.list(queryFilters),
    placeholderData: prev => prev,
  })

  // ── Fixed expenses status ─────────────────────────────────────────────────
  const activeCycleStart = selectedCycle !== 'all' && selectedCycle.includes('|')
    ? selectedCycle.split('|')[0] : null

  const { data: feStatus } = useQuery<FixedExpensesStatus>({
    queryKey: ['fe-status', activeCycleStart],
    queryFn: () => dashboardApi.fixedExpensesStatus(activeCycleStart ?? undefined),
    enabled: !!activeCycleStart,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: expensesApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })

  const applyFixedMutation = useMutation({
    mutationFn: (cs: string) => dashboardApi.applyFixedExpenses(cs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      qc.invalidateQueries({ queryKey: ['category-breakdown'] })
      qc.invalidateQueries({ queryKey: ['payment-breakdown'] })
      qc.invalidateQueries({ queryKey: ['fe-status', activeCycleStart] })
    },
  })

  // ── Helpers ───────────────────────────────────────────────────────────────
  function handleCycleChange(value: string) {
    setSelectedCycle(value)
    setDateRange(value === 'all' ? { start: '', end: '' }
      : (() => { const [s, e] = value.split('|'); return { start: s, end: e } })())
  }

  const activeCycleLabel = billingCycles.find(
    c => `${c.start_date}|${c.end_date}` === selectedCycle
  )?.label ?? null

  const hasFilters = !!filters.description || !!filters.category_id || !!filters.payment_method_id

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setDescInput('')
  }

  // ── TanStack Table (client-side sort only; data fetched server-side) ───────
  const columns = useMemo(() => [
    colHelper.accessor('date', {
      header: 'Date',
      cell: info => <span className="tabular-nums text-muted-foreground">{formatDate(info.getValue())}</span>,
    }),
    colHelper.accessor('description', {
      header: 'Description',
      cell: info => (
        <span className="font-medium">
          {info.getValue()}
          {info.row.original.is_fixed && (
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              recurring
            </span>
          )}
        </span>
      ),
    }),
    colHelper.accessor('category_name', {
      header: 'Category',
      cell: info => (
        <Badge className={cn('border-0 text-xs', categoryColor(info.getValue()))}>
          {info.getValue()}
        </Badge>
      ),
    }),
    colHelper.accessor('payment_method_name', {
      header: 'Payment Method',
      cell: info => <span className="text-xs text-muted-foreground">{info.getValue()}</span>,
    }),
    colHelper.accessor('amount', {
      header: 'Amount',
      cell: info => <span className="tabular-nums font-semibold">{formatCurrency(info.getValue())}</span>,
      meta: { align: 'right' },
    }),
    colHelper.display({
      id: 'actions',
      header: '',
      cell: info => (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setEditExpense(info.row.original); setShowForm(true) }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirmDeleteId(info.row.original.id)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    }),
  ], [])

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  })

  // pagination window
  const totalPages = data?.total_pages ?? 0
  const from = data ? (page - 1) * pageSize + 1 : 0
  const to = data ? Math.min(page * pageSize, data.total) : 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            {activeCycleLabel ?? 'All time'}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Expense
        </Button>
      </div>

      {/* ── MUI-style DataTable card ──────────────────────────────────────── */}
      <div className="rounded-lg border bg-background shadow-sm">

        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className={cn(
          'flex flex-wrap items-center gap-3 px-4 py-3 border-b transition-colors',
          hasFilters && 'bg-primary/5'
        )}>
          {/* Left: title or filter-active label */}
          <div className="flex-1 min-w-0">
            {hasFilters ? (
              <span className="text-sm font-medium text-primary">
                {data?.total ?? '…'} result{data?.total !== 1 ? 's' : ''} filtered
              </span>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">
                {data?.total ?? '…'} records
              </span>
            )}
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Billing cycle */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Cycle</span>
              <Select
                value={selectedCycle}
                onChange={e => handleCycleChange(e.target.value)}
                className="h-8 w-56 text-xs"
              >
                <option value="all">All time</option>
                {billingCycles.map(c => (
                  <option key={`${c.start_date}|${c.end_date}`} value={`${c.start_date}|${c.end_date}`}>
                    {c.label}{c.is_current ? ' (current)' : ''}
                  </option>
                ))}
              </Select>
            </div>

            {/* Fixed expense apply / status */}
            {activeCycleStart && feStatus && (
              feStatus.all_applied ? (
                <span className="flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <RefreshCw className="h-3 w-3" />
                  Fixed applied ({feStatus.applied_count}/{feStatus.total_eligible})
                </span>
              ) : (
                <Button variant="outline" size="sm" className="h-8 text-xs"
                  onClick={() => applyFixedMutation.mutate(activeCycleStart)}
                  disabled={applyFixedMutation.isPending}
                >
                  <RefreshCw className={cn('mr-1.5 h-3 w-3', applyFixedMutation.isPending && 'animate-spin')} />
                  {applyFixedMutation.isPending ? 'Applying…'
                    : `Apply Fixed (${feStatus.applied_count}/${feStatus.total_eligible})`}
                </Button>
              )
            )}

            {/* Filter toggle */}
            <Button
              variant={showFilters || hasFilters ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowFilters(v => !v)}
            >
              <Filter className="mr-1.5 h-3 w-3" />
              Filters{hasFilters ? ` (${[filters.description, filters.category_id, filters.payment_method_id].filter(Boolean).length})` : ''}
            </Button>

            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Filter panel (collapsible) ──────────────────────────────── */}
        {showFilters && (
          <div className="grid grid-cols-1 gap-3 border-b bg-muted/20 px-4 py-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={descInput}
                  onChange={e => setDescInput(e.target.value)}
                  placeholder="Search…"
                  className="h-8 pl-8 text-sm"
                />
                {descInput && (
                  <button onClick={() => { setDescInput(''); setFilters(f => ({ ...f, description: '' })) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select
                value={filters.category_id}
                onChange={e => setFilters(f => ({ ...f, category_id: e.target.value }))}
                className="h-8 text-sm"
              >
                <option value="">All categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
              <Select
                value={filters.payment_method_id}
                onChange={e => setFilters(f => ({ ...f, payment_method_id: e.target.value }))}
                className="h-8 text-sm"
              >
                <option value="">All methods</option>
                {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
              </Select>
            </div>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b bg-muted/30 text-left">
                  {hg.headers.map((header: Header<ExpenseOut, unknown>) => {
                    const isSortable = header.column.getCanSort()
                    const sorted = header.column.getIsSorted()
                    const isRight = (header.column.columnDef.meta as { align?: string } | undefined)?.align === 'right'
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground select-none',
                          isRight && 'text-right',
                          isSortable && 'cursor-pointer hover:text-foreground'
                        )}
                        onClick={isSortable ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <span className="flex items-center gap-1.5" style={isRight ? { justifyContent: 'flex-end' } : {}}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {isSortable && (
                            sorted === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" />
                            : sorted === 'desc' ? <ArrowDown className="h-3 w-3 text-primary" />
                            : <ArrowUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>

            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}

              {!isLoading && table.getRowModel().rows.map((row: Row<ExpenseOut>, idx: number) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b transition-colors hover:bg-muted/40',
                    idx % 2 === 0 ? '' : 'bg-muted/10'
                  )}
                >
                  {row.getVisibleCells().map((cell: Cell<ExpenseOut, unknown>) => {
                    const isRight = (cell.column.columnDef.meta as { align?: string } | undefined)?.align === 'right'
                    return (
                      <td key={cell.id} className={cn('px-4 py-2.5', isRight && 'text-right')}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))}

              {!isLoading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-muted-foreground">
                    {hasFilters ? 'No records match your filters.' : 'No expenses yet. Click "Add Expense" to get started.'}
                  </td>
                </tr>
              )}
            </tbody>

            {/* ── Summary tfoot ── */}
            {!isLoading && data && data.total > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={3} className="px-4 py-2.5 text-xs text-muted-foreground">
                    Total{hasFilters ? ' (filtered)' : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                    {data.total} records
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-primary tabular-nums">
                    {formatCurrency(data.total_amount)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ── MUI-style TablePagination footer ───────────────────────── */}
        <div className="flex flex-wrap items-center justify-end gap-4 border-t px-4 py-2 text-sm text-muted-foreground">
          {/* Rows per page */}
          <div className="flex items-center gap-2">
            <span className="text-xs whitespace-nowrap">Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="rounded border bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Range indicator */}
          <span className="text-xs tabular-nums whitespace-nowrap">
            {data ? `${from}–${to} of ${data.total}` : '—'}
          </span>

          {/* Prev / Next */}
          <div className="flex items-center gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="rounded p-1 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="rounded p-1 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
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
