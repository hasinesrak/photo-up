import { useAuth } from "@/components/auth-provider"
import { AuthScreen } from "@/features/auth-screen"
import { Dashboard } from "@/features/dashboard"
import { Spinner } from "@/components/ui/spinner"

export function App() {
  const { user, initializing } = useAuth()

  if (initializing) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  return (
    <div
      key={user ? "dashboard" : "auth"}
      className="animate-in fade-in duration-500"
    >
      {user ? <Dashboard /> : <AuthScreen />}
    </div>
  )
}

export default App
