"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/Field"
import { Input } from "@workspace/ui/components/Input"
import { SheetClose, SheetFooter } from "@workspace/ui/components/Sheet"
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent, useState } from "react"
import z from "zod"
import { apiClient } from "@/lib/api-client"
import { TeamMembershipFields, type TeamMemberDraft } from "@/components/teams/TeamMembershipFields"

const CreateTeamFormSchema = z.object({
  name: z.string().min(1, { error: "Name is required." }),
})

interface CreateTeamFormProps {
  onSuccess?: () => void
}

export const CreateTeamForm: FunctionComponent<CreateTeamFormProps> = ({ onSuccess }) => {
  const queryClient = useQueryClient()

  const [teamLeaderId, setTeamLeaderId] = useState<string | null>(null)
  const [members, setMembers] = useState<TeamMemberDraft[]>([])

  const createTeam = useMutation({
    mutationFn: async (values: z.infer<typeof CreateTeamFormSchema>) => {
      const { data, error } = await apiClient.POST("/api/teams", {
        body: {
          name: values.name,
          teamLeaderId: teamLeaderId ?? undefined,
          members: members.map((member) => ({ userId: member.user.id })),
        },
      })

      if (error) throw new Error("Failed to create team.")
      return data
    },
    onSuccess: () => {
      toast.success("Team created.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
      createTeamForm.reset()
      setTeamLeaderId(null)
      setMembers([])
      onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const createTeamForm = useForm({
    validators: {
      onSubmit: CreateTeamFormSchema,
    },
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ value }) => {
      // mutateAsync rethrows on failure (its onError above already shows a
      // toast) and TanStack Form's handleSubmit rethrows again on top of
      // that - left uncaught, that becomes an unhandled rejection since the
      // form is submitted via `void handleSubmit()`.
      await createTeam.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <>
      <form
        id="create-team-form"
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void createTeamForm.handleSubmit()
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4"
      >
        <FieldGroup>
          <createTeamForm.Field name="name">
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
                    placeholder="Worship Team"
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </createTeamForm.Field>

          <TeamMembershipFields
            teamLeaderId={teamLeaderId}
            onTeamLeaderIdChange={setTeamLeaderId}
            members={members}
            onMembersChange={setMembers}
          />
        </FieldGroup>
      </form>
      <SheetFooter className="flex-row justify-end border-t bg-muted/50">
        <SheetClose render={<Button variant="outline" disabled={createTeam.isPending} />}>Cancel</SheetClose>
        <Button type="submit" form="create-team-form" disabled={createTeam.isPending}>
          {createTeam.isPending ? "Creating..." : "Create team"}
        </Button>
      </SheetFooter>
    </>
  )
}
