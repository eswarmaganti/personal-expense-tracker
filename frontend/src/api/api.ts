import { apiClient } from './client'
import type {
  LoginInput, RegisterInput, ProfileInput, ChangePasswordInput,
  ExpenseInput, CategoryInput, PaymentMethodInput, FixedExpenseInput, SettingsInput,
} from '@/lib/validations/schemas'

export interface BillingCycleSettingsOut {
  cycle_start: string        // YYYY-MM-DD
  billing_cycle_start_day: number
  monthly_salary: number
}

// ── Types (mirrors backend schemas) ──────────────────────────────────────────

export interface UserOut { id: number; name: string; email: string; created_at: string }
export interface TokenResponse { access_token: string; refresh_token: string; token_type: string }
export interface CategoryOut { id: number; name: string }
export interface PaymentMethodOut { id: number; name: string }
export interface ExpenseOut {
  id: number; date: string; description: string; amount: number
  payment_method_id: number; payment_method_name: string
  category_id: number; category_name: string
  fixed_expense_id: number | null; is_fixed: boolean
  created_at: string
}
export interface ExpensePage {
  items: ExpenseOut[]; total: number; total_amount: number; page: number; page_size: number; total_pages: number
}
export interface ExpenseFilters {
  page?: number; page_size?: number
  start_date?: string; end_date?: string
  category_id?: number; payment_method_id?: number
  description?: string
}
/** @deprecated Use BillingCycleSettingsOut instead */
export interface UserSettingsOut { billing_cycle_start_day: number; monthly_salary: number }
export interface BillingCycleOut {
  label: string
  start_date: string
  end_date: string
  is_current: boolean
}
export interface FixedExpenseOut {
  id: number; description: string; amount: number
  category_id: number | null; category_name: string | null
  payment_method_id: number | null; payment_method_name: string | null
}
export interface DashboardSummary {
  current_month: string
  cycle_start: string   // YYYY-MM-DD
  cycle_end: string     // YYYY-MM-DD
  total_spent: number
  transaction_count: number
  avg_per_day: number
  monthly_salary: number
  total_fixed: number
  savings: number
  yearly_savings: number
}
export interface MonthlySummary { month: string; total: number; transaction_count: number; salary: number; savings: number }
export interface CategoryBreakdown { category: string; amount: number }
export interface PaymentBreakdown { payment_method: string; amount: number }

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: RegisterInput) => apiClient.post<UserOut>('/auth/register', data).then(r => r.data),
  login: (data: LoginInput) => apiClient.post<TokenResponse>('/auth/login', data).then(r => r.data),
  refresh: (refresh_token: string) => apiClient.post<TokenResponse>('/auth/refresh', { refresh_token }).then(r => r.data),
  me: () => apiClient.get<UserOut>('/auth/me').then(r => r.data),
  updateProfile: (data: ProfileInput) => apiClient.put<UserOut>('/auth/me', data).then(r => r.data),
  changePassword: (data: ChangePasswordInput) => apiClient.put('/auth/me/password', data),
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export const expensesApi = {
  list: (filters: ExpenseFilters = {}) => apiClient.get<ExpensePage>('/expenses', { params: filters }).then(r => r.data),
  create: (data: ExpenseInput) => apiClient.post<ExpenseOut>('/expenses', data).then(r => r.data),
  update: (id: number, data: Partial<ExpenseInput>) => apiClient.put<ExpenseOut>(`/expenses/${id}`, data).then(r => r.data),
  remove: (id: number) => apiClient.delete(`/expenses/${id}`),
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface FixedExpensesStatus {
  total_eligible: number
  applied_count: number
  all_applied: boolean
}

export const dashboardApi = {
  fixedExpensesStatus: (cycleStart?: string) =>
    apiClient.get<FixedExpensesStatus>('/dashboard/fixed-expenses-status', {
      params: cycleStart ? { cycle_start: cycleStart } : {},
    }).then(r => r.data),
  applyFixedExpenses: (cycleStart?: string) =>
    apiClient.post<FixedExpenseOut[]>('/dashboard/apply-fixed-expenses', null, {
      params: cycleStart ? { cycle_start: cycleStart } : {},
    }).then(r => r.data),
  summary: (cycleStart?: string, cycleEnd?: string) =>
    apiClient.get<DashboardSummary>('/dashboard/summary', {
      params: cycleStart && cycleEnd ? { cycle_start: cycleStart, cycle_end: cycleEnd } : {},
    }).then(r => r.data),
  billingCycles: () => apiClient.get<BillingCycleOut[]>('/dashboard/billing-cycles').then(r => r.data),
  monthlyTrend: (months = 6) => apiClient.get<MonthlySummary[]>('/dashboard/monthly-trend', { params: { months } }).then(r => r.data),
  categoryBreakdown: (startDate?: string, endDate?: string) =>
    apiClient.get<CategoryBreakdown[]>('/dashboard/category-breakdown', {
      params: startDate && endDate ? { start_date: startDate, end_date: endDate } : {},
    }).then(r => r.data),
  paymentBreakdown: (startDate?: string, endDate?: string) =>
    apiClient.get<PaymentBreakdown[]>('/dashboard/payment-breakdown', {
      params: startDate && endDate ? { start_date: startDate, end_date: endDate } : {},
    }).then(r => r.data),
}

// ── Settings ──────────────────────────────────────────────────────────────────

export const settingsApi = {
  // per-cycle settings
  getCycleSettings: (cycleStart: string) =>
    apiClient.get<BillingCycleSettingsOut>(`/settings/cycle/${cycleStart}`).then(r => r.data),
  updateCycleSettings: (cycleStart: string, data: SettingsInput) =>
    apiClient.put<BillingCycleSettingsOut>(`/settings/cycle/${cycleStart}`, data).then(r => r.data),
  // categories
  listCategories: () => apiClient.get<CategoryOut[]>('/settings/categories').then(r => r.data),
  createCategory: (data: CategoryInput) => apiClient.post<CategoryOut>('/settings/categories', data).then(r => r.data),
  updateCategory: (id: number, data: CategoryInput) => apiClient.put<CategoryOut>(`/settings/categories/${id}`, data).then(r => r.data),
  deleteCategory: (id: number) => apiClient.delete(`/settings/categories/${id}`),
  // payment methods
  listPaymentMethods: () => apiClient.get<PaymentMethodOut[]>('/settings/payment-methods').then(r => r.data),
  createPaymentMethod: (data: PaymentMethodInput) => apiClient.post<PaymentMethodOut>('/settings/payment-methods', data).then(r => r.data),
  updatePaymentMethod: (id: number, data: PaymentMethodInput) => apiClient.put<PaymentMethodOut>(`/settings/payment-methods/${id}`, data).then(r => r.data),
  deletePaymentMethod: (id: number) => apiClient.delete(`/settings/payment-methods/${id}`),
  // fixed expenses
  listFixedExpenses: () => apiClient.get<FixedExpenseOut[]>('/settings/fixed-expenses').then(r => r.data),
  createFixedExpense: (data: FixedExpenseInput) => apiClient.post<FixedExpenseOut>('/settings/fixed-expenses', data).then(r => r.data),
  updateFixedExpense: (id: number, data: Partial<FixedExpenseInput>) => apiClient.put<FixedExpenseOut>(`/settings/fixed-expenses/${id}`, data).then(r => r.data),
  deleteFixedExpense: (id: number) => apiClient.delete(`/settings/fixed-expenses/${id}`),
}
