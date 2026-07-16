"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/Field"
import { Input } from "@workspace/ui/components/Input"
import { SheetFooter } from "@workspace/ui/components/Sheet"
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent, useState } from "react"
import z from "zod"
import { apiClient } from "@/lib/api-client"
import { TeamMembershipFields, type TeamMemberDraft } from "@/components/TeamMembershipFields"
import type { Team } from "@/components/TeamList"

const EditTeamFormSchema = z.object({
  name: z.string().min(1, { error: "Name is required." }),
})

interface EditTeamFormProps {
  team: Team
  onSuccess?: () => void
  onCancel?: () => void
  /** Focuses the musicians search input on mount - see TeamMembershipFields' prop of the same name. */
  autoFocusMusicians?: boolean
}

export const EditTeamForm: FunctionComponent<EditTeamFormProps> = ({
  team,
  onSuccess,
  onCancel,
  autoFocusMusicians,
}) => {
  const queryClient = useQueryClient()

  const [teamLeaderId, setTeamLeaderId] = useState<string | null>(team.leader?.id ?? null)
  const [members, setMembers] = useState<TeamMemberDraft[]>(
    team.members.map((m) => ({ user: m.user, roles: m.roles }))
  )

  const updateTeam = useMutation({
    mutationFn: async (values: z.infer<typeof EditTeamFormSchema>) => {
      const { error: updateError } = await apiClient.PATCH("/api/teams/{id}", {
        params: { path: { id: team.id } },
        body: {
          name: values.name,
          teamLeaderId,
        },
      })
      if (updateError) throw new Error("Failed to update team.")

      // Reconciles the roster against the original snapshot (`team.members`,
      // captured at mount) via the individual member/role endpoints rather
      // than one atomic call - unlike creation (see createTeam's transaction
      // in apps/api/src/services/teams.ts), an update also has to handle
      // removals, which a single additive endpoint can't express.
      const editedByUserId = new Map(members.map((m) => [m.user.id, m]))
      const originalByUserId = new Map(team.members.map((m) => [m.user.id, m]))

      for (const original of team.members) {
        if (editedByUserId.has(original.user.id)) continue
        const { error } = await apiClient.DELETE("/api/teams/{id}/members/{memberId}", {
          params: { path: { id: team.id, memberId: original.id } },
        })
        if (error) throw new Error("Failed to remove a team member.")
      }

      for (const draft of members) {
        if (originalByUserId.has(draft.user.id)) continue
        const { data, error } = await apiClient.POST("/api/teams/{id}/members", {
          params: { path: { id: team.id } },
          body: { userId: draft.user.id },
        })
        if (error) throw new Error("Failed to add a team member.")

        // addTeamMember just added this user, so it's guaranteed to be in
        // the team it returns.
        const newMember = data.members.find((m) => m.user.id === draft.user.id)!
        for (const role of draft.roles) {
          const { error: roleError } = await apiClient.POST("/api/teams/{id}/members/{memberId}/roles", {
            params: {
              path: {
                id: team.id,
                memberId: newMember.id,
              },
            },
            body: { role },
          })
          if (roleError) throw new Error("Failed to assign a role.")
        }
      }

      for (const draft of members) {
        const original = originalByUserId.get(draft.user.id)
        if (!original) continue

        const rolesToAdd = draft.roles.filter((role) => !original.roles.includes(role))
        const rolesToRemove = original.roles.filter((role) => !draft.roles.includes(role))

        for (const role of rolesToAdd) {
          const { error } = await apiClient.POST("/api/teams/{id}/members/{memberId}/roles", {
            params: { path: { id: team.id, memberId: original.id } },
            body: { role },
          })
          if (error) throw new Error("Failed to assign a role.")
        }
        for (const role of rolesToRemove) {
          const { error } = await apiClient.DELETE("/api/teams/{id}/members/{memberId}/roles/{role}", {
            params: { path: { id: team.id, memberId: original.id, role } },
          })
          if (error) throw new Error("Failed to remove a role.")
        }
      }
    },
    onSuccess: () => {
      toast.success("Team updated.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
      onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const editTeamForm = useForm({
    validators: {
      onSubmit: EditTeamFormSchema,
    },
    defaultValues: {
      name: team.name,
    },
    onSubmit: async ({ value }) => {
      // mutateAsync rethrows on failure (its onError above already shows a
      // toast) and TanStack Form's handleSubmit rethrows again on top of
      // that - left uncaught, that becomes an unhandled rejection since the
      // form is submitted via `void handleSubmit()`.
      await updateTeam.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <>
      <form
        id="edit-team-form"
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void editTeamForm.handleSubmit()
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4"
      >
        <FieldGroup>
          <editTeamForm.Field name="name">
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
          </editTeamForm.Field>

          <TeamMembershipFields
            initialLeaderName={team.leader?.name}
            teamLeaderId={teamLeaderId}
            onTeamLeaderIdChange={setTeamLeaderId}
            members={members}
            onMembersChange={setMembers}
            autoFocusMembers={autoFocusMusicians}
          />
        </FieldGroup>
      </form>
      <SheetFooter className="flex-row justify-end border-t bg-muted/50">
        <Button type="button" variant="outline" disabled={updateTeam.isPending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form="edit-team-form" disabled={updateTeam.isPending}>
          {updateTeam.isPending ? "Saving..." : "Save changes"}
        </Button>
      </SheetFooter>
    </>
  )
}
