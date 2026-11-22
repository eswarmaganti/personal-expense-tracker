import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2, Check, X, User, Receipt } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

import { settingsApi, type FixedExpenseOut } from '@/api/api'
import {
  fixedExpenseSchema,
  settingsSchema,
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
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
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
}: {
  items: T[]
  onCreate: (name: string) => void
  onUpdate: (id: number, name: string) => void
  onDelete: (id: number) => void
  placeholder: string
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
              <span className="text-sm">{item.name}</span>
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
  onDelete,
  onAdd,
}: {
  fixedExpenses: FixedExpenseOut[]
  categories: { id: number; name: string }[]
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
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Amount</th>
              <th className="px-3 py-2 font-semibold text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {fixedExpenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No fixed expenses yet. Add one below.
                </td>
              </tr>
            )}
            {fixedExpenses.map((fe, idx) => (
              <tr key={fe.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-2 font-medium">{fe.description}</td>
                <td className="px-3 py-2 text-muted-foreground">{fe.category_name ?? '—'}</td>
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
                <td colSpan={3} className="px-3 py-2 font-semibold">
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-1">
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
        </div>
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

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: settingsApi.listCategories })
  const { data: paymentMethods = [] } = useQuery({ queryKey: ['payment-methods'], queryFn: settingsApi.listPaymentMethods })
  const { data: fixedExpenses = [] } = useQuery({ queryKey: ['fixed-expenses'], queryFn: settingsApi.listFixedExpenses })
  const { data: appSettings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })

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

  // ── Budget settings form ──────────────────────────────────────────────────
  const settingsForm = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    values: appSettings ?? { billing_cycle_start_day: 12, monthly_salary: 0 },
  })
  const updateSettings = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
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
                <InlineList
                  items={categories}
                  onCreate={(name) => createCat.mutate({ name })}
                  onUpdate={(id, name) => updateCat.mutate({ id, data: { name } })}
                  onDelete={(id) => deleteCat.mutate(id)}
                  placeholder="New category…"
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

            {/* Budget & Billing Cycle */}
            <Card>
              <CardHeader>
                <CardTitle>Budget & Billing Cycle</CardTitle>
                <CardDescription>Your salary and the day each billing cycle starts</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={settingsForm.handleSubmit((d) => updateSettings.mutate(d))} className="space-y-4">
                  <div className="space-y-1">
                    <Label>Billing Cycle Start Day <span className="text-muted-foreground">(1–28)</span></Label>
                    <Input type="number" min={1} max={28} {...settingsForm.register('billing_cycle_start_day')} />
                    <p className="text-xs text-muted-foreground">
                      e.g. 12 → cycle runs from the 12th of each month to the 11th of the next
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label>Monthly Salary (₹)</Label>
                    <Input type="number" step="0.01" placeholder="0.00" {...settingsForm.register('monthly_salary')} />
                  </div>
                  {updateSettings.isSuccess && (
                    <p className="text-sm text-green-600">Settings saved.</p>
                  )}
                  <Button type="submit" disabled={updateSettings.isPending}>
                    {updateSettings.isPending ? 'Saving…' : 'Save'}
                  </Button>
                </form>
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
            <Card className="lg:col-span-2">
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
