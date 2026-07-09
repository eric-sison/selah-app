"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/Alert"
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
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent } from "react"
import z from "zod"
import { authClient } from "@/lib/auth-client"
import { InfoIcon } from "lucide-react"
import { ErrorMessages } from "@/utils/error-messages"

type SignInFormProps = {
  callbackURL?: string
  error?: string
}

const SignInFormSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }),
  password: z.string().min(8, { error: "Password must be at least 8 characters." }),
})

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  signup_disabled: "Contact your admin to get an invitation link.",
}

export const SignInForm: FunctionComponent<SignInFormProps> = ({ callbackURL = "/", error }) => {
  const router = useRouter()
  const oauthErrorMessage = error
    ? (OAUTH_ERROR_MESSAGES[error] ?? "Something went wrong signing you in.")
    : undefined

  const emailSignIn = useMutation({
    mutationFn: async (values: z.infer<typeof SignInFormSchema>) => {
      await authClient.signIn.email({
        email: values.email,
        password: values.password,
        fetchOptions: {
          onError(ctx) {
            let errorMessage = ""

            switch (ctx.error.status) {
              case 401: {
                errorMessage = ErrorMessages[401].INVALID_CREDENTIALS.short
                break
              }
              case 403: {
                errorMessage = ErrorMessages[403].EMAIL_NOT_VERIFIED.short
                break
              }
              case 404: {
                errorMessage = ErrorMessages[404].RESOURCE_NOT_FOUND.short
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
                console.error("User SignIn", ctx.error)
                break
              }
            }

            toast.error(errorMessage, {
              position: "top-center",
            })
          },
          onSuccess: () => {
            router.push(callbackURL)
          },
        },
      })
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
        // Same reasoning as callbackURL - must be absolute. better-auth
        // appends "?error=<code>" itself, which this form reads back via
        // the `error` prop to show a message (e.g. disableSignUp rejections).
        errorCallbackURL: new URL("/auth/sign-in", window.location.origin).toString(),
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
        {oauthErrorMessage && (
          <Alert variant="destructive" className="mb-6">
            <InfoIcon />
            <AlertTitle>No account found</AlertTitle>
            <AlertDescription>{oauthErrorMessage}</AlertDescription>
          </Alert>
        )}
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                className="bi bi-facebook"
                viewBox="0 0 16 16"
              >
                <path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951" />
              </svg>
              Continue with Facebook
            </Button>
            {facebookSignIn.isError && <FieldError>{facebookSignIn.error.message}</FieldError>}
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

            {emailSignIn.isError && <FieldError>{emailSignIn.error.message}</FieldError>}
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
