"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/Card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldTitle } from "@workspace/ui/components/Field"
import { toast } from "@workspace/ui/components/Sonner"
import { format } from "date-fns"
import { Laptop, Smartphone } from "lucide-react"
import { FunctionComponent } from "react"
import { authClient } from "@/lib/auth-client"
import { useSession } from "@/components/SessionProvider"

function describeDevice(userAgent: string | null | undefined): { label: string; isMobile: boolean } {
  if (!userAgent) return { label: "Unknown device", isMobile: false }

  const isMobile = /iPhone|iPad|Android/.test(userAgent)
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Unknown browser"
  const os = /Mac OS X/.test(userAgent)
    ? "macOS"
    : /Windows/.test(userAgent)
      ? "Windows"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown OS"

  return { label: `${browser} · ${os}`, isMobile }
}

export const SessionsList: FunctionComponent = () => {
  const queryClient = useQueryClient()
  const session = useSession()
  const currentToken = (session?.session.token as string | undefined) ?? null

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { data, error } = await authClient.listSessions()
      if (error) throw new Error(error.message ?? "Failed to load sessions.")
      return data
    },
  })

  const revokeSession = useMutation({
    mutationFn: async (token: string) => {
      const { error } = await authClient.revokeSession({ token })
      if (error) throw new Error(error.message ?? "Failed to revoke session.")
    },
    onSuccess: () => {
      toast.success("Session revoked.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["sessions"] })
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const revokeOtherSessions = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions()
      if (error) throw new Error(error.message ?? "Failed to sign out other devices.")
    },
    onSuccess: () => {
      toast.success("Signed out of other devices.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["sessions"] })
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const sortedSessions = [...(sessions.data ?? [])].sort((a, b) =>
    a.token === currentToken ? -1 : b.token === currentToken ? 1 : 0
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>Devices currently signed in to your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {sessions.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : sortedSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active sessions.</p>
          ) : (
            sortedSessions.map((s) => {
              const isCurrent = s.token === currentToken
              const { label, isMobile } = describeDevice(s.userAgent)

              return (
                <Field key={s.id} orientation="responsive">
                  <FieldContent className="@md/field-group:w-56 @md/field-group:shrink-0">
                    <FieldTitle className="flex items-center gap-2">
                      {isMobile ? (
                        <Smartphone className="size-4 text-muted-foreground" />
                      ) : (
                        <Laptop className="size-4 text-muted-foreground" />
                      )}
                      {label}
                      {isCurrent && <Badge variant="secondary">This device</Badge>}
                    </FieldTitle>
                    <FieldDescription>
                      {s.ipAddress ?? "Unknown IP"} · signed in {format(new Date(s.createdAt), "PP")}
                    </FieldDescription>
                  </FieldContent>
                  <div className="flex w-full items-center justify-end @md/field-group:max-w-sm">
                    {!isCurrent && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeSession.mutate(s.token)}
                        disabled={revokeSession.isPending}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </Field>
              )
            })
          )}
        </FieldGroup>
      </CardContent>
      {sortedSessions.length > 1 && (
        <CardFooter className="justify-between">
          <span className="text-xs text-muted-foreground">{sortedSessions.length} sessions shown</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => revokeOtherSessions.mutate()}
            disabled={revokeOtherSessions.isPending}
          >
            {revokeOtherSessions.isPending ? "Signing out..." : "Sign out other devices"}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
