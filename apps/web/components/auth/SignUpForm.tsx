"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { CheckCircle2Icon } from "lucide-react"
import { Button } from "@workspace/ui/components/Button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/Card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/Field"
import { Input } from "@workspace/ui/components/Input"
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent } from "react"
import z from "zod"
import { authClient } from "@/lib/auth-client"
import { ErrorMessages } from "@/utils/error-messages"

type SignUpFormProps = {
  email: string
  token: string
}

const SignUpFormSchema = z
  .object({
    name: z.string().min(1, { error: "Please enter your name." }),
    password: z.string().min(8, { error: "Password must be at least 8 characters." }),
    confirmPassword: z.string().min(8, { error: "Please confirm your password." }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  })

export const SignUpForm: FunctionComponent<SignUpFormProps> = ({ email, token }) => {
  const signUp = useMutation({
    mutationFn: async (values: z.infer<typeof SignUpFormSchema>) => {
      await authClient.signUp.email({
        email,
        name: values.name,
        password: values.password,
        // The verification email's link is processed by the API server,
        // which then redirects here - must be absolute to the web app's
        // origin, same reasoning as the Facebook sign-in callbackURL fix.
        callbackURL: new URL("/auth/sign-in", window.location.origin).toString(),
        fetchOptions: {
          query: { token },
          onError(ctx) {
            let errorMessage = ""

            switch (ctx.error.status) {
              case 400:
              case 403: {
                errorMessage = "This invitation is invalid or has expired."
                break
              }
              case 409: {
                errorMessage = ErrorMessages[409].RESOURCE_CONFLICT.short
                break
              }
              case 422: {
                errorMessage = ErrorMessages[422].VALIDATION_FAILED.short
                break
              }
              case 429: {
                errorMessage = ErrorMessages[429].TOO_MANY_REQUESTS.short
                break
              }
              case 500: {
                errorMessage = ErrorMessages[500].SERVER_ERROR.short
                break
              }
              default: {
                errorMessage = "Something went wrong. Please try again."
                console.error("User SignUp", ctx.error)
                break
              }
            }

            toast.error(errorMessage, {
              position: "top-center",
            })
          },
        },
      })
    },
  })

  const SignUpForm = useForm({
    validators: {
      onSubmit: SignUpFormSchema,
    },
    defaultValues: {
      name: "",
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      await signUp.mutateAsync(value)
    },
  })

  if (signUp.isSuccess) {
    return (
      <Card className="w-sm">
        <CardHeader className="text-center">
          <CheckCircle2Icon className="mx-auto mb-2 size-8 text-primary" />
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a verification link to {email}. Verify your address to finish setting up your account.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="w-sm">
      <CardHeader className="text-center">
        <CardTitle>Create your account</CardTitle>
        <CardDescription>You&apos;ve been invited to sign up as {email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="sign-up-form"
          className="space-y-7"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void SignUpForm.handleSubmit()
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email Address</FieldLabel>
              <Input id="email" name="email" value={email} disabled readOnly />
              <FieldDescription>This account will be created for the invited address.</FieldDescription>
            </Field>

            <SignUpForm.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="John Doe"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </SignUpForm.Field>

            <SignUpForm.Field name="password">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      type="password"
                      aria-invalid={isInvalid}
                      placeholder="Must be at least 8 characters long"
                      autoComplete="off"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </SignUpForm.Field>

            <SignUpForm.Field name="confirmPassword">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Confirm Password</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      type="password"
                      aria-invalid={isInvalid}
                      placeholder="Re-enter your password"
                      autoComplete="off"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </SignUpForm.Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Field>
          <Button type="submit" form="sign-up-form" disabled={signUp.isPending}>
            {signUp.isPending ? "Creating account..." : "Create account"}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  )
}
