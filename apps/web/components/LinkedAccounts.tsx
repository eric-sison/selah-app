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
import { Field, FieldContent, FieldDescription, FieldGroup, FieldTitle } from "@workspace/ui/components/Field"
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
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>Link social accounts to sign in without a password.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="responsive">
            <FieldContent className="@md/field-group:w-56 @md/field-group:shrink-0">
              <FieldTitle>Facebook</FieldTitle>
              <FieldDescription>Link your Facebook account so you can sign in with it next time.</FieldDescription>
            </FieldContent>
            <div className="flex w-full items-center @md/field-group:max-w-sm">
              {accounts.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : isFacebookLinked ? (
                <p className="text-sm text-muted-foreground">Your Facebook account is linked.</p>
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
            </div>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
