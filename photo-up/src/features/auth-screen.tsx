import * as React from "react"
import { toast } from "sonner"
import {
  ArrowRightIcon,
  CloudArrowUpIcon,
} from "@phosphor-icons/react"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Mode = "login" | "register"

function Logo() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="animate-in fade-in zoom-in-50 duration-700 rounded-3xl bg-primary p-4 text-primary-foreground shadow-xl shadow-primary/25">
        <CloudArrowUpIcon weight="fill" className="size-9" />
      </div>
      <div className="text-center">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          PhotoUp
        </h1>
        <p className="text-sm text-muted-foreground">
          Your photos, beautifully organized.
        </p>
      </div>
    </div>
  )
}

export function AuthScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = React.useState<Mode>("login")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    const name = String(formData.get("name") ?? "")
    const email = String(formData.get("email") ?? "")
    const password = String(formData.get("password") ?? "")

    setPending(true)
    setError(null)

    try {
      if (mode === "register") {
        await register(name, email, password)
        toast.success("Welcome to PhotoUp!", {
          description: "Your account has been created.",
        })
      } else {
        await login(email, password)
        toast.success("Welcome back!")
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      {/* Ambient background blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 size-[28rem] -translate-x-1/2 animate-pulse rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 size-96 animate-pulse rounded-full bg-chart-1/10 blur-3xl [animation-delay:1s]"
      />

      <div className="relative w-full max-w-sm animate-in fade-in slide-in-from-bottom-6 zoom-in-95 duration-500">
        <Logo />

        <Card className="mt-8 shadow-2xl shadow-black/5">
          <Tabs
            value={mode}
            onValueChange={(value) => {
              setMode(value as Mode)
              setError(null)
            }}
          >
            <CardHeader>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Log in</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              <TabsContent value={mode}>
                <form
                  key={mode}
                  onSubmit={handleSubmit}
                  className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <p className="mb-5 text-center text-sm text-muted-foreground">
                    {mode === "login"
                      ? "Log in to your account to continue."
                      : "Create an account to start uploading."}
                  </p>

                  <div className="flex flex-col gap-4">
                    {mode === "register" && (
                      <Field>
                        <FieldLabel htmlFor="name">Name</FieldLabel>
                        <Input
                          id="name"
                          name="name"
                          autoComplete="name"
                          required
                        />
                      </Field>
                    )}

                    <Field>
                      <FieldLabel htmlFor="email">Email</FieldLabel>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        required
                      />
                      <FieldDescription>
                        {mode === "register" && "Must be at least 6 characters."}
                      </FieldDescription>
                    </Field>

                    {error && (
                      <p
                        role="alert"
                        className="animate-in fade-in slide-in-from-top-1 text-sm text-destructive"
                      >
                        {error}
                      </p>
                    )}

                    <Button type="submit" disabled={pending} className="w-full">
                      {pending ? (
                        <Spinner />
                      ) : (
                        <ArrowRightIcon data-icon="inline-end" />
                      )}
                      {mode === "login"
                        ? pending
                          ? "Logging in…"
                          : "Log in"
                        : pending
                          ? "Creating account…"
                          : "Create account"}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  )
}
