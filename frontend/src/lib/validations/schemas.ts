import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().min(1, 'Email or username is required'),
  password: z.string().min(5, 'Password must be at least 5 characters'),
})

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const expenseSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  description: z.string().min(1, 'Description is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  category_id: z.coerce.number().positive('Category is required'),
  payment_method_id: z.coerce.number().positive('Payment method is required'),
})

export const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
})

export const paymentMethodSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
})

export const fixedExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  category_id: z.coerce.number().optional(),
})

export const profileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
})

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(6, 'New password must be at least 6 characters'),
    confirm_password: z.string().min(6),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

export const settingsSchema = z.object({
  billing_cycle_start_day: z.coerce.number().min(1).max(28),
  monthly_salary: z.coerce.number().min(0),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ExpenseInput = z.infer<typeof expenseSchema>
export type CategoryInput = z.infer<typeof categorySchema>
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>
export type FixedExpenseInput = z.infer<typeof fixedExpenseSchema>
export type ProfileInput = z.infer<typeof profileSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type SettingsInput = z.infer<typeof settingsSchema>
