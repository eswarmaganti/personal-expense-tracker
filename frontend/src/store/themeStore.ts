import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      toggle: () =>
        set((s) => {
          const next = s.theme === 'light' ? 'dark' : 'light'
          applyTheme(next)
          return { theme: next }
        }),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
    }),
    { name: 'expense-tracker-theme' }
  )
)

// Apply saved theme on first load (before React mounts)
const saved = localStorage.getItem('expense-tracker-theme')
if (saved) {
  try {
    const { state } = JSON.parse(saved) as { state: { theme: Theme } }
    applyTheme(state.theme)
  } catch {
    /* ignore parse errors */
  }
}
