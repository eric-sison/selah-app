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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/Field"
import { Input } from "@workspace/ui/components/Input"
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent } from "react"
import z from "zod"
import { authClient } from "@/lib/auth-client"
import { useSession } from "@/components/SessionProvider"

const EmailFormSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }),
})

export const EmailForm: FunctionComponent = () => {
  const session = useSession()
  const currentEmail = (session?.user.email as string | undefined) ?? ""

  const changeEmail = useMutation({
    mutationFn: async (values: z.infer<typeof EmailFormSchema>) => {
      const { error } = await authClient.changeEmail({
        newEmail: values.email,
        // Same reasoning as the Facebook link/sign-up callbacks - this is
        // followed from a link in the verification email, so it must be
        // absolute to the web app's origin rather than a relative path.
        callbackURL: new URL("/settings", window.location.origin).toString(),
      })
      if (error) throw new Error(error.message ?? "Failed to request email change.")
    },
    onSuccess: () => {
      toast.success("Check your new email inbox to confirm the change.", { position: "top-center" })
      EmailForm.reset()
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const EmailForm = useForm({
    validators: {
      onSubmit: EmailFormSchema,
    },
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      await changeEmail.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email address</CardTitle>
        <CardDescription>Changing your email sends a confirmation link to the new address.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="email-form"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void EmailForm.handleSubmit()
          }}
        >
          <FieldGroup>
            <EmailForm.Field name="email">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field orientation="responsive" data-invalid={isInvalid}>
                    <FieldContent className="@md/field-group:w-56 @md/field-group:shrink-0">
                      <FieldLabel htmlFor={field.name}>Current email</FieldLabel>
                      <FieldDescription>You&apos;re currently signed in as {currentEmail}.</FieldDescription>
                    </FieldContent>
                    <div className="flex w-full flex-col gap-1.5 @md/field-group:max-w-sm">
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="newaddress@example.com"
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      <FieldDescription>
                        We&apos;ll email a verification link to confirm the change.
                      </FieldDescription>
                    </div>
                  </Field>
                )
              }}
            </EmailForm.Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="submit" form="email-form" disabled={changeEmail.isPending}>
          {changeEmail.isPending ? "Sending..." : "Send verification link"}
        </Button>
      </CardFooter>
    </Card>
  )
}
