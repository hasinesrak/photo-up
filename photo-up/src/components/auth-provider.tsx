/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import * as auth from "@/lib/auth"

type AuthContextValue = {
  user: auth.User | null
  /** True until the stored token has been checked against the API. */
  initializing: boolean
  login: (email: string, password: string) => Promise<auth.User>
  register: (name: string, email: string, password: string) => Promise<auth.User>
  logout: () => void
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<auth.User | null>(null)
  const [initializing, setInitializing] = React.useState(true)

  // Restore the session on first mount by validating the stored token.
  React.useEffect(() => {
    let cancelled = false

    auth
      .getSessionUser()
      .then((restored) => {
        if (!cancelled) setUser(restored)
      })
      .finally(() => {
        if (!cancelled) setInitializing(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      login: async (email, password) => {
        const nextUser = await auth.login(email, password)
        setUser(nextUser)
        return nextUser
      },
      register: async (name, email, password) => {
        const nextUser = await auth.register(name, email, password)
        setUser(nextUser)
        return nextUser
      },
      logout: () => {
        auth.logout()
        setUser(null)
      },
    }),
    [user, initializing]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = React.useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
}
