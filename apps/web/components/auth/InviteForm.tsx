"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/Card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/Field"
import { Input } from "@workspace/ui/components/Input"
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent } from "react"
import z from "zod"

const InviteFormSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }),
})

export const InviteForm: FunctionComponent = () => {
  const invite = useMutation({
    mutationFn: async (values: z.infer<typeof InviteFormSchema>) => {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message ?? "Failed to send invitation.")
      }

      return res.json()
    },
    onSuccess: (data) => {
      toast.success(`Invitation sent to ${data.email}.`, { position: "top-center" })
      InviteForm.reset()
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const InviteForm = useForm({
    validators: {
      onSubmit: InviteFormSchema,
    },
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      // mutateAsync rethrows on failure (its onError below already shows a
      // toast) and TanStack Form's handleSubmit rethrows again on top of
      // that - left uncaught, that becomes an unhandled rejection since the
      // form is submitted via `void handleSubmit()`.
      await invite.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Invite a user</CardTitle>
        <CardDescription>Sends a sign-up link valid for 2 hours.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="invite-form"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void InviteForm.handleSubmit()
          }}
        >
          <FieldGroup>
            <InviteForm.Field name="email">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Email Address</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="newhire@example.com"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </InviteForm.Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Field>
          <Button type="submit" form="invite-form" disabled={invite.isPending}>
            {invite.isPending ? "Sending..." : "Send invite"}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  )
}
