import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate } from '@/lib/utils'

describe('formatCurrency', () => {
  it('formats a number as INR currency', () => {
    const result = formatCurrency(5000)
    expect(result).toContain('5,000')
  })

  it('handles zero', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0')
  })
})

describe('formatDate', () => {
  it('formats an ISO date string', () => {
    const result = formatDate('2026-11-22')
    expect(result).toMatch(/nov/i)
    expect(result).toContain('2026')
  })
})
