"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@workspace/ui/components/Field"
import { Input } from "@workspace/ui/components/Input"
import { FunctionComponent } from "react"
import z from "zod"
import { authClient } from "@/lib/auth-client"

type SignInFormProps = {
  callbackURL?: string
}

const SignInFormSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }),
  password: z.string().min(8, { error: "Password must be at least 8 characters." }),
})

export const SignInForm: FunctionComponent<SignInFormProps> = ({ callbackURL = "/" }) => {
  const router = useRouter()

  const emailSignIn = useMutation({
    mutationFn: async (values: z.infer<typeof SignInFormSchema>) => {
      const { data, error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      })
      if (error) throw new Error(error.message ?? "Failed to sign in.")
      return data
    },
    onSuccess: () => {
      router.push(callbackURL)
    },
  })

  const facebookSignIn = useMutation({
    mutationFn: async () => {
      // Unlike email sign-in, this redirect is issued by the API server
      // itself after Facebook's callback - callbackURL must be absolute to
      // the web app's origin, or the API redirects to its own origin instead.
      const { data, error } = await authClient.signIn.social({
        provider: "facebook",
        callbackURL: new URL(callbackURL, window.location.origin).toString(),
      })
      if (error) throw new Error(error.message ?? "Failed to sign in with Facebook.")
      return data
    },
  })

  const SignInForm = useForm({
    validators: {
      onSubmit: SignInFormSchema,
    },
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await emailSignIn.mutateAsync(value)
    },
  })

  return (
    <Card className="w-sm">
      <CardHeader className="text-center">
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in with your Facebook account</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="credentials-signin-form"
          className="space-y-7"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void SignInForm.handleSubmit()
          }}
        >
          <FieldGroup className="mt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={facebookSignIn.isPending}
              onClick={() => facebookSignIn.mutate()}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                <path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.89h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
              </svg>
              Continue with Facebook
            </Button>
            {facebookSignIn.isError && (
              <FieldError>{facebookSignIn.error.message}</FieldError>
            )}
          </FieldGroup>

          <FieldSeparator className="mb-7 *:data-[slot=field-separator-content]:bg-card">
            Or continue with
          </FieldSeparator>

          <FieldGroup>
            <SignInForm.Field name="email">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Email Address</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="johndoe@example.com"
                    />
                    {isInvalid ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : (
                      <FieldDescription>Please enter your active email address.</FieldDescription>
                    )}
                  </Field>
                )
              }}
            </SignInForm.Field>

            <SignInForm.Field name="password">
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
            </SignInForm.Field>

            {emailSignIn.isError && (
              <FieldError>{emailSignIn.error.message}</FieldError>
            )}
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Field>
          <Button type="submit" form="credentials-signin-form" disabled={emailSignIn.isPending}>
            {emailSignIn.isPending ? "Signing in..." : "Sign In"}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  )
}
