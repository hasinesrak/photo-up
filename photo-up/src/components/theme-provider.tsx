/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

type Theme = "light"

type ThemeProviderProps = {
  children: React.ReactNode
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = "theme"

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

export function ThemeProvider({
  children,
  ...props
}: ThemeProviderProps) {
  React.useEffect(() => {
    const root = document.documentElement

    root.classList.remove("dark")
    root.classList.add("light")
    root.style.colorScheme = "light"
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const setTheme = React.useCallback(() => {}, [])

  const value = React.useMemo(
    () => ({
      theme: "light" as const,
      setTheme,
    }),
    [setTheme]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
