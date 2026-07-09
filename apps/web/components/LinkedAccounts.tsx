"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/Card"
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent } from "react"
import { authClient } from "@/lib/auth-client"

export const LinkedAccounts: FunctionComponent = () => {
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts()
      if (error) throw new Error(error.message ?? "Failed to load linked accounts.")
      return data
    },
  })

  const linkFacebook = useMutation({
    mutationFn: async () => {
      // Same reasoning as the sign-in flow's callbackURL/errorCallbackURL -
      // this redirect is issued by the API server after Facebook's
      // callback, so both must be absolute to the web app's origin.
      const { error } = await authClient.linkSocial({
        provider: "facebook",
        callbackURL: new URL("/settings", window.location.origin).toString(),
        errorCallbackURL: new URL("/settings", window.location.origin).toString(),
      })
      if (error) throw new Error(error.message ?? "Failed to link Facebook account.")
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const isFacebookLinked = accounts.data?.some((account) => account.providerId === "facebook")

  return (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>
          Link your Facebook account so you can sign in with it next time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {accounts.isLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : isFacebookLinked ? (
          <p className="text-muted-foreground text-sm">Your Facebook account is linked.</p>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => linkFacebook.mutate()}
            disabled={linkFacebook.isPending}
          >
            {linkFacebook.isPending ? "Redirecting..." : "Link Facebook account"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
