import { Document, Font, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { DashboardSummary, CategoryBreakdown, PaymentBreakdown, ExpenseOut } from '@/api/api'

// ── Register Inter (includes ₹ glyph) ────────────────────────────────────────
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf', fontWeight: 700 },
  ],
})
Font.registerHyphenationCallback((word) => [word])

// ── Number helpers ────────────────────────────────────────────────────────────
// Plain number with commas (no currency symbol) — used for the second number in "₹ 1,000 / 1,500"
function numFmt(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return `${amount < 0 ? '-' : ''}${formatted}`
}

// ₹ prefix + number — used only once per amount display (the leading value)
function rupee(amount: number): string {
  return `\u20B9 ${numFmt(amount)}`
}

// Budget label: "₹ 1,000 / 1,500" or "₹ 8,200 (no limit)"
function budgetLabel(spent: number, limit: number): string {
  if (limit > 0) return `${rupee(spent)} / ${numFmt(limit)}`
  return `${rupee(spent)}  (no limit)`
}

// ── Colour constants ──────────────────────────────────────────────────────────
const NAVY    = '#0f172a'
const WHITE   = '#ffffff'
const SLATE_50  = '#f8fafc'
const SLATE_100 = '#f1f5f9'
const SLATE_200 = '#e2e8f0'
const SLATE_500 = '#64748b'
const SLATE_700 = '#334155'
const SLATE_900 = '#0f172a'
const BLUE   = '#3b82f6'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const INDIGO = '#6366f1'

const STAT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6']
const DOT_COLORS  = ['#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#84cc16','#a855f7','#ef4444']

// ── StyleSheet ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    paddingTop: 28, paddingBottom: 28, paddingLeft: 28, paddingRight: 28,
    fontFamily: 'Inter', backgroundColor: WHITE, fontSize: 9,
  },

  // Header
  header: {
    backgroundColor: NAVY, borderRadius: 6,
    paddingTop: 14, paddingBottom: 14, paddingLeft: 18, paddingRight: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 18,
  },
  headerTitle: { color: WHITE, fontSize: 15, fontWeight: 700 },
  headerSub:   { color: '#94a3b8', fontSize: 7.5, marginTop: 3 },
  headerRight: { alignItems: 'flex-end' },
  headerUser:  { color: WHITE, fontSize: 9, fontWeight: 700 },

  // Section title
  sectionTitle: {
    fontSize: 9.5, fontWeight: 700, color: SLATE_700,
    backgroundColor: SLATE_100,
    paddingTop: 5, paddingBottom: 5, paddingLeft: 10, paddingRight: 10,
    marginBottom: 0, borderRadius: 3,
  },
  // Padded content wrapper inside each section
  sectionBody: {
    paddingTop: 10, paddingBottom: 14, paddingLeft: 10, paddingRight: 10,
  },

  // Summary stat cards
  statRow:  { flexDirection: 'row', gap: 7 },
  statCard: { flex: 1, paddingTop: 10, paddingBottom: 10, paddingLeft: 10, paddingRight: 10, borderRadius: 5 },
  statLabel: { color: WHITE, fontSize: 7, opacity: 0.85, marginBottom: 7, fontWeight: 400 },
  statValue: { color: WHITE, fontSize: 11, fontWeight: 700 },

  // Bar rows (budget + payment)
  barRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  barLabel: { width: 90, fontSize: 8, color: SLATE_500, fontWeight: 400 },
  barTrack: { width: 200, height: 9, backgroundColor: SLATE_200, borderRadius: 4, overflow: 'hidden' },
  barFill:  { height: 9 },
  barAmt:   { width: 135, fontSize: 8, color: SLATE_700, fontWeight: 700, textAlign: 'right', marginLeft: 8 },

  // Expense table
  tableHeader: {
    flexDirection: 'row', backgroundColor: SLATE_100,
    paddingTop: 5, paddingBottom: 5, paddingLeft: 6, paddingRight: 6,
    borderRadius: 3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingTop: 5, paddingBottom: 5, paddingLeft: 6, paddingRight: 6,
  },
  tableRowAlt: {
    flexDirection: 'row', backgroundColor: SLATE_50,
    paddingTop: 5, paddingBottom: 5, paddingLeft: 6, paddingRight: 6,
  },
  dateGroupHeader: {
    backgroundColor: '#dbeafe',
    paddingTop: 3, paddingBottom: 3, paddingLeft: 6, paddingRight: 6,
    fontSize: 7.5, fontWeight: 700, color: '#1e40af',
    marginTop: 4,
  },
  colHd: { fontSize: 8, fontWeight: 700, color: SLATE_700 },
  col1: { width: '12%', fontSize: 8, color: SLATE_500 },
  col2: { width: '32%', fontSize: 8, color: SLATE_900 },
  col3: { width: '20%', fontSize: 8, color: SLATE_700 },
  col4: { width: '20%', fontSize: 8, color: SLATE_500 },
  col5: { width: '16%', fontSize: 8, fontWeight: 700, color: SLATE_900, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    paddingTop: 7, paddingBottom: 7, paddingLeft: 6, paddingRight: 6,
    backgroundColor: NAVY, borderRadius: 3, marginTop: 2,
  },
  totalLabel: { flex: 1, color: WHITE, fontSize: 9, fontWeight: 700 },
  totalValue: { width: '16%', color: WHITE, fontSize: 9, fontWeight: 700, textAlign: 'right' },
})

// ── Props ─────────────────────────────────────────────────────────────────────
interface CycleStatementPDFProps {
  userName: string
  cycleLabel: string
  cycleStart: string
  cycleEnd: string
  summary: DashboardSummary
  catBreakdown: CategoryBreakdown[]
  payBreakdown: PaymentBreakdown[]
  expenses: ExpenseOut[]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ userName, cycleLabel }: { userName: string; cycleLabel: string }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerTitle}>Expense Statement</Text>
        <Text style={styles.headerSub}>{cycleLabel}</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerUser}>{userName}</Text>
        <Text style={styles.headerSub}>Personal Expense Tracker</Text>
      </View>
    </View>
  )
}

function SummarySection({ summary }: { summary: DashboardSummary }) {
  const stats = [
    { label: 'Total Spent',    value: rupee(summary.total_spent),       color: STAT_COLORS[0] },
    { label: 'Salary',         value: rupee(summary.monthly_salary),    color: STAT_COLORS[1] },
    { label: 'Savings',        value: rupee(summary.savings),           color: STAT_COLORS[2] },
    { label: 'Avg / Day',      value: rupee(summary.avg_per_day),       color: STAT_COLORS[3] },
    { label: 'Transactions',   value: String(summary.transaction_count), color: STAT_COLORS[4] },
    { label: 'Fixed Expenses', value: rupee(summary.total_fixed),       color: STAT_COLORS[5] },
  ]
  return (
    <View style={styles.sectionBody}>
      <View style={styles.statRow}>
        {stats.map((s) => (
          <View key={s.label} style={[styles.statCard, { backgroundColor: s.color }]}>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function BudgetSection({ catBreakdown }: { catBreakdown: CategoryBreakdown[] }) {
  const filtered = catBreakdown.filter((c) => c.amount > 0)
  if (filtered.length === 0) return null
  const hasAnyBudget = filtered.some((c) => c.budget_limit > 0)
  return (
    <View style={styles.sectionBody}>
      {/* Legend — only shown when at least one category has a budget set */}
      {hasAnyBudget && (
        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 10 }}>
          {[
            { color: BLUE,   label: 'On track' },
            { color: AMBER,  label: 'Near limit (≥80%)' },
            { color: RED,    label: 'Over budget (>100%)' },
            { color: INDIGO, label: 'No limit set' },
          ].map((l) => (
            <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
              <Text style={{ fontSize: 7, color: SLATE_500 }}>{l.label}</Text>
            </View>
          ))}
        </View>
      )}

      {filtered.map((c) => {
        // Actual uncapped percentage so over-budget rows show e.g. 142%
        const rawPct    = c.budget_limit > 0 ? (c.amount / c.budget_limit) * 100 : 100
        const fillColor = c.budget_limit === 0 ? INDIGO : rawPct >= 100 ? RED : rawPct >= 80 ? AMBER : BLUE
        // Bar fill is capped at track width; overflow hidden clips it cleanly
        const fillWidth = Math.min(Math.round((200 * rawPct) / 100), 200)
        const pctLabel  = c.budget_limit > 0 ? `${Math.round(rawPct)}%` : ''

        return (
          <View key={c.category_id} style={[styles.barRow, {
            borderLeftWidth: 3,
            borderLeftColor: fillColor,
            paddingLeft: 7,
            backgroundColor: `${fillColor}0d`,   // 5% tint of the status colour
            borderRadius: 3,
            marginBottom: 6,
          }]}>
            {/* Category name coloured to status */}
            <Text style={[styles.barLabel, { color: fillColor, fontWeight: 700 }]}>{c.category}</Text>

            {/* Progress bar */}
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: fillWidth, backgroundColor: fillColor }]} />
            </View>

            {/* Percentage text */}
            {pctLabel !== '' && (
              <Text style={{ fontSize: 7.5, color: SLATE_700, fontWeight: 700, marginLeft: 6, width: 30, textAlign: 'right' }}>{pctLabel}</Text>
            )}

            {/* Amount label */}
            <Text style={styles.barAmt}>{budgetLabel(c.amount, c.budget_limit)}</Text>
          </View>
        )
      })}
    </View>
  )
}

function PaymentSection({ payBreakdown }: { payBreakdown: PaymentBreakdown[] }) {
  const maxAmt = Math.max(...payBreakdown.map((p) => p.amount), 1)
  return (
    <View style={styles.sectionBody}>
      {payBreakdown.map((p) => {
        const fillWidth = Math.min(Math.round((200 * p.amount) / maxAmt), 200)
        return (
          <View key={p.payment_method} style={styles.barRow}>
            <Text style={styles.barLabel}>{p.payment_method}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: fillWidth, backgroundColor: INDIGO }]} />
            </View>
            <Text style={styles.barAmt}>{rupee(p.amount)}</Text>
          </View>
        )
      })}
    </View>
  )
}

function ExpenseTable({ expenses }: { expenses: ExpenseOut[] }) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  let lastDate = ''
  let rowIndex  = 0

  return (
    <View style={styles.sectionBody}>
      {/* Table header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.col1, styles.colHd]}>Date</Text>
        <Text style={[styles.col2, styles.colHd]}>Description</Text>
        <Text style={[styles.col3, styles.colHd]}>Category</Text>
        <Text style={[styles.col4, styles.colHd]}>Payment Method</Text>
        <Text style={[styles.col5, styles.colHd]}>Amount</Text>
      </View>

      {/* Data rows */}
      {expenses.map((e) => {
        const isNewDate = e.date !== lastDate
        lastDate = e.date
        const rowStyle = rowIndex % 2 === 0 ? styles.tableRow : styles.tableRowAlt
        rowIndex++
        const dotColor = DOT_COLORS[e.category_id % 12]

        return (
          <View key={e.id}>
            {isNewDate && (
              <View style={styles.dateGroupHeader}>
                <Text>{e.date}</Text>
              </View>
            )}
            <View style={rowStyle}>
              <Text style={styles.col1}>{e.date}</Text>
              <Text style={styles.col2}>{e.description}</Text>
              <View style={[styles.col3, { flexDirection: 'row', alignItems: 'center' }]}>
                <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: dotColor, marginRight: 3, marginTop: 1 }} />
                <Text style={{ fontSize: 8, color: SLATE_700 }}>{e.category_name}</Text>
              </View>
              <Text style={styles.col4}>{e.payment_method_name}</Text>
              <Text style={styles.col5}>{rupee(e.amount)}</Text>
            </View>
          </View>
        )
      })}

      {/* Total row */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total Expenses</Text>
        <Text style={styles.totalValue}>{rupee(total)}</Text>
      </View>
    </View>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function CycleStatementPDF({
  userName,
  cycleLabel,
  summary,
  catBreakdown,
  payBreakdown,
  expenses,
}: CycleStatementPDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header userName={userName} cycleLabel={cycleLabel} />

        <Text style={styles.sectionTitle}>Summary</Text>
        <SummarySection summary={summary} />

        <Text style={styles.sectionTitle}>Budget vs Spend</Text>
        <BudgetSection catBreakdown={catBreakdown} />

        <Text style={styles.sectionTitle}>Spend by Payment Method</Text>
        <PaymentSection payBreakdown={payBreakdown} />

        <Text style={styles.sectionTitle}>Expense List</Text>
        <ExpenseTable expenses={expenses} />
      </Page>
    </Document>
  )
}
