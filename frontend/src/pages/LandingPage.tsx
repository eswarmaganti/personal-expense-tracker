import { Link } from 'react-router-dom'
import { TrendingUp, PieChart, BarChart3, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'

const features = [
  { icon: BarChart3, title: 'Track Expenses', desc: 'Log every transaction with category, payment method, and date.' },
  { icon: PieChart, title: 'Visual Insights', desc: 'Pie charts and histograms turn your data into clear spending stories.' },
  { icon: TrendingUp, title: '6-Month Trends', desc: 'See how your spending evolves month over month at a glance.' },
  { icon: Shield, title: 'Secure & Private', desc: 'Your data stays local in SQLite. No cloud, no third parties.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">ExpenseTracker</span>
          </div>
          <Link to="/login">
            <Button>Login</Button>
          </Link>
        </div>
      </header>

      <section className="container mx-auto px-6 py-24 text-center">
        <h1 className="mb-6 text-5xl font-bold tracking-tight">
          Your Personal Finance,{' '}
          <span className="text-primary">Simplified</span>
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-xl text-muted-foreground">
          Ditch the Excel sheet. Track expenses, monitor budgets, and visualize your spending — all in one clean web app.
        </p>
        <Link to="/login">
          <Button size="lg">Get Started</Button>
        </Link>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-lg border bg-card p-6 shadow-sm">
              <Icon className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-2 font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
