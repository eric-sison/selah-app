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
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/Field"
import { Input } from "@workspace/ui/components/Input"
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent } from "react"
import z from "zod"
import { authClient } from "@/lib/auth-client"

const PasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Please enter your current password." }),
    newPassword: z.string().min(8, { error: "Password must be at least 8 characters." }),
    confirmPassword: z.string().min(8, { error: "Please confirm your new password." }),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  })

export const PasswordForm: FunctionComponent = () => {
  const changePassword = useMutation({
    mutationFn: async (values: z.infer<typeof PasswordFormSchema>) => {
      const { error } = await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: true,
      })
      if (error) throw new Error(error.message ?? "Failed to change password.")
    },
    onSuccess: () => {
      toast.success("Password updated.", { position: "top-center" })
      PasswordForm.reset()
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const PasswordForm = useForm({
    validators: {
      onSubmit: PasswordFormSchema,
    },
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      await changePassword.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Updating your password signs out every other active session.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="password-form"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void PasswordForm.handleSubmit()
          }}
        >
          <FieldGroup>
            <PasswordForm.Field name="currentPassword">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field orientation="responsive" data-invalid={isInvalid}>
                    <FieldContent className="@md/field-group:w-56 @md/field-group:shrink-0">
                      <FieldLabel htmlFor={field.name}>Current password</FieldLabel>
                    </FieldContent>
                    <div className="flex w-full flex-col gap-1.5 @md/field-group:max-w-sm">
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        type="password"
                        aria-invalid={isInvalid}
                        autoComplete="current-password"
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </div>
                  </Field>
                )
              }}
            </PasswordForm.Field>

            <PasswordForm.Field name="newPassword">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field orientation="responsive" data-invalid={isInvalid}>
                    <FieldContent className="@md/field-group:w-56 @md/field-group:shrink-0">
                      <FieldLabel htmlFor={field.name}>New password</FieldLabel>
                    </FieldContent>
                    <div className="flex w-full flex-col gap-1.5 @md/field-group:max-w-sm">
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        type="password"
                        aria-invalid={isInvalid}
                        placeholder="Must be at least 8 characters long"
                        autoComplete="new-password"
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </div>
                  </Field>
                )
              }}
            </PasswordForm.Field>

            <PasswordForm.Field name="confirmPassword">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field orientation="responsive" data-invalid={isInvalid}>
                    <FieldContent className="@md/field-group:w-56 @md/field-group:shrink-0">
                      <FieldLabel htmlFor={field.name}>Confirm new password</FieldLabel>
                    </FieldContent>
                    <div className="flex w-full flex-col gap-1.5 @md/field-group:max-w-sm">
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        type="password"
                        aria-invalid={isInvalid}
                        placeholder="Re-enter your new password"
                        autoComplete="new-password"
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </div>
                  </Field>
                )
              }}
            </PasswordForm.Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="submit" form="password-form" disabled={changePassword.isPending}>
          {changePassword.isPending ? "Updating..." : "Update password"}
        </Button>
      </CardFooter>
    </Card>
  )
}
