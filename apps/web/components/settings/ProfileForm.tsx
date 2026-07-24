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
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your name and photo, visible to the rest of the team.</CardDescription>
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
            <ProfileForm.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field orientation="responsive" data-invalid={isInvalid}>
                    <FieldContent className="@md/field-group:w-56 @md/field-group:shrink-0">
                      <FieldLabel htmlFor={field.name}>Full name</FieldLabel>
                      <FieldDescription>Your display name.</FieldDescription>
                    </FieldContent>
                    <div className="flex w-full flex-col gap-1.5 @md/field-group:max-w-sm">
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
                    </div>
                  </Field>
                )
              }}
            </ProfileForm.Field>

            <ProfileForm.Field name="image">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field orientation="responsive" data-invalid={isInvalid}>
                    <FieldContent className="@md/field-group:w-56 @md/field-group:shrink-0">
                      <FieldLabel htmlFor={field.name}>Profile photo</FieldLabel>
                      <FieldDescription>This photo will be visible to others.</FieldDescription>
                    </FieldContent>
                    <div className="flex w-full items-center gap-3 @md/field-group:max-w-sm">
                      <Avatar size="lg">
                        <AvatarImage src={field.state.value || undefined} />
                        <AvatarFallback className="uppercase">{name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-1 flex-col gap-1.5">
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
                      </div>
                    </div>
                  </Field>
                )
              }}
            </ProfileForm.Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="submit" form="profile-form" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Saving..." : "Save changes"}
        </Button>
      </CardFooter>
    </Card>
  )
}
