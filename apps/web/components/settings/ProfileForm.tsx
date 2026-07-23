"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
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
import { useRouter } from "next/navigation"
import z from "zod"
import { authClient } from "@/lib/auth-client"
import { useSession } from "@/components/SessionProvider"

const ProfileFormSchema = z.object({
  name: z.string().min(1, { error: "Please enter your name." }),
  image: z.union([z.url({ error: "Please enter a valid URL." }), z.literal("")]),
})

export const ProfileForm: FunctionComponent = () => {
  const router = useRouter()
  const session = useSession()
  const name = (session?.user.name as string | undefined) ?? ""
  const image = (session?.user.image as string | undefined) ?? ""

  const updateProfile = useMutation({
    mutationFn: async (values: z.infer<typeof ProfileFormSchema>) => {
      const { error } = await authClient.updateUser({
        name: values.name,
        image: values.image || null,
      })
      if (error) throw new Error(error.message ?? "Failed to update profile.")
    },
    onSuccess: () => {
      toast.success("Profile updated.", { position: "top-center" })
      // The session shown across the app (breadcrumb avatar, etc.) comes
      // from a server-rendered layout, not this mutation's response - a
      // router refresh re-runs it so the new name/image show up immediately.
      router.refresh()
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const ProfileForm = useForm({
    validators: {
      onSubmit: ProfileFormSchema,
    },
    defaultValues: {
      name,
      image,
    },
    onSubmit: async ({ value }) => {
      await updateProfile.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your name and avatar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="profile-form"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void ProfileForm.handleSubmit()
          }}
        >
          <FieldGroup>
            <Avatar size="lg">
              <AvatarImage src={image || undefined} />
              <AvatarFallback className="uppercase">{name.charAt(0)}</AvatarFallback>
            </Avatar>

            <ProfileForm.Field name="name">
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
            </ProfileForm.Field>

            <ProfileForm.Field name="image">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Avatar URL</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="https://example.com/avatar.jpg"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </ProfileForm.Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Field>
          <Button type="submit" form="profile-form" disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Saving..." : "Save changes"}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  )
}
