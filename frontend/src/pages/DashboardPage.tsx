import { useQuery } from '@tanstack/react-query'
import {
  dashboardApi,
  type DashboardSummary,
  type MonthlySummary,
  type CategoryBreakdown,
  type PaymentBreakdown,
} from '@/api/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { TrendingUp, Receipt, Wallet, PiggyBank, CalendarRange, TrendingDown, Sparkles } from 'lucide-react'

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316']

// ── Coloured KPI card ─────────────────────────────────────────────────────────

type CardVariant = 'red' | 'green' | 'blue' | 'neutral'

interface SummaryCardProps {
  title: string
  value: string
  subtitle?: string
  subtitleValue?: string
  icon: React.ElementType
  variant?: CardVariant
}

const variantStyles: Record<CardVariant, { card: string; icon: string; value: string }> = {
  red: {
    card: 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800',
    icon: 'text-red-500 dark:text-red-400',
    value: 'text-red-700 dark:text-red-300',
  },
  green: {
    card: 'bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800',
    icon: 'text-green-500 dark:text-green-400',
    value: 'text-green-700 dark:text-green-300',
  },
  blue: {
    card: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800',
    icon: 'text-blue-500 dark:text-blue-400',
    value: 'text-blue-700 dark:text-blue-300',
  },
  neutral: {
    card: '',
    icon: 'text-muted-foreground',
    value: '',
  },
}

function SummaryCard({ title, value, subtitle, subtitleValue, icon: Icon, variant = 'neutral' }: SummaryCardProps) {
  const styles = variantStyles[variant]
  return (
    <Card className={styles.card}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={`mt-1 text-2xl font-bold ${styles.value}`}>{value}</p>
            {subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">
                {subtitle}
                {subtitleValue && (
                  <span className={`ml-1 font-semibold ${styles.value}`}>{subtitleValue}</span>
                )}
              </p>
            )}
          </div>
          <Icon className={`ml-3 h-5 w-5 shrink-0 ${styles.icon}`} />
        </div>
      </CardContent>
    </Card>
  )
}

// ── Billing cycle badge ───────────────────────────────────────────────────────

function BillingCycleBadge({ start, end }: { start: string; end: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground">
      <CalendarRange className="h-4 w-4 shrink-0 text-primary" />
      <span>
        Billing cycle: <strong className="text-foreground">{formatDate(start)}</strong>
        {' → '}
        <strong className="text-foreground">{formatDate(end)}</strong>
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: dashboardApi.summary,
  })

  const { data: trend } = useQuery<MonthlySummary[]>({
    queryKey: ['monthly-trend'],
    queryFn: () => dashboardApi.monthlyTrend(6),
  })

  // Breakdowns use the actual billing window from summary once loaded
  const { data: catBreakdown } = useQuery<CategoryBreakdown[]>({
    queryKey: ['category-breakdown', summary?.cycle_start, summary?.cycle_end],
    queryFn: () => dashboardApi.categoryBreakdown(summary?.cycle_start, summary?.cycle_end),
    enabled: !!summary,
  })

  const { data: payBreakdown } = useQuery<PaymentBreakdown[]>({
    queryKey: ['payment-breakdown', summary?.cycle_start, summary?.cycle_end],
    queryFn: () => dashboardApi.paymentBreakdown(summary?.cycle_start, summary?.cycle_end),
    enabled: !!summary,
  })

  const savings = summary?.savings ?? 0
  const yearlySavings = summary?.yearly_savings ?? 0
  const savingsVariant: CardVariant = savings >= 0 ? 'green' : 'red'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Your spending overview</p>
        </div>
        {summary && (
          <BillingCycleBadge start={summary.cycle_start} end={summary.cycle_end} />
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          title="Total Spent"
          value={formatCurrency(summary?.total_spent ?? 0)}
          subtitle={`${summary?.transaction_count ?? 0} transactions`}
          icon={TrendingDown}
          variant="red"
        />
        <SummaryCard
          title="Avg. Per Day"
          value={formatCurrency(summary?.avg_per_day ?? 0)}
          subtitle="this billing cycle"
          icon={TrendingUp}
          variant="red"
        />
        <SummaryCard
          title="Monthly Salary"
          value={formatCurrency(summary?.monthly_salary ?? 0)}
          subtitle={`Fixed: ${formatCurrency(summary?.total_fixed ?? 0)}`}
          icon={Wallet}
          variant="blue"
        />
        <SummaryCard
          title="Net Savings"
          value={formatCurrency(savings)}
          subtitle={savings >= 0 ? 'On track 🎉' : 'Over budget ⚠️'}
          icon={PiggyBank}
          variant={savingsVariant}
        />
        <SummaryCard
          title="Est. Yearly Savings"
          value={formatCurrency(yearlySavings)}
          subtitle="This cycle ×12 · current:"
          subtitleValue={formatCurrency(savings)}
          icon={Sparkles}
          variant={savingsVariant}
        />
      </div>

      {/* 6-Cycle Trend — grouped bar: salary vs expenses */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>6-Cycle Spending Trend</CardTitle>
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-blue-500" />
                Salary
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-red-500" />
                Expenses
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
                Savings
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trend ?? []} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                cursor={false}
                formatter={(v: number, name: string) => [
                  formatCurrency(v),
                  name === 'salary' ? 'Salary' : name === 'total' ? 'Expenses' : 'Savings',
                ]}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Bar dataKey="salary"  name="salary"  fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="total"   name="total"   fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="savings" name="savings" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Spend by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={catBreakdown ?? []} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  tick={{ fontSize: 12 }}
                  width={90}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  cursor={false}
                  formatter={(v: number) => [formatCurrency(v), 'Amount']}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="amount" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Spend by Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={payBreakdown ?? []} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  type="category"
                  dataKey="payment_method"
                  tick={{ fontSize: 12 }}
                  width={120}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  cursor={false}
                  formatter={(v: number) => [formatCurrency(v), 'Amount']}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="amount" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Pie */}
      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown (Pie)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={catBreakdown ?? []}
                dataKey="amount"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={120}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {(catBreakdown ?? []).map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => [formatCurrency(v), 'Amount']}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  color: 'hsl(var(--foreground))',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend wrapperStyle={{ color: 'hsl(var(--foreground))' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
