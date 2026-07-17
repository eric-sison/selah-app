"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import { Button } from "@workspace/ui/components/Button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/Combobox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/DropdownMenu"
import { Field, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/Field"
import { Input } from "@workspace/ui/components/Input"
import { InputGroupAddon } from "@workspace/ui/components/InputGroup"
import { SheetClose, SheetFooter } from "@workspace/ui/components/Sheet"
import { toast } from "@workspace/ui/components/Sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/Tabs"
import { Textarea } from "@workspace/ui/components/Textarea"
import { ChevronDown, Users } from "lucide-react"
import { FunctionComponent, useState } from "react"
import z from "zod"
import { apiClient } from "@/lib/api-client"
import { LineupRosterFields, type LineupMemberDraft } from "@/components/line-ups/LineupRosterFields"
import { LineupSongsField, type LineupSongDraft } from "@/components/line-ups/LineupSongsField"
import type { Team } from "@/components/teams/TeamList"
import type { User } from "@/components/teams/TeamMembershipFields"
import {
  LINEUP_SERVICE_TYPES,
  formatLineupServiceType,
  type LineupServiceType,
} from "@/utils/lineup-service-type"

const CreateLineupFormSchema = z.object({
  serviceType: z.enum(LINEUP_SERVICE_TYPES, { error: "Service type is required." }),
  serviceDate: z.string().min(1, { error: "Service date is required." }),
  rehearsalDate: z.string(),
  seriesName: z.string().min(1, { error: "Series name is required." }),
  topic: z.string().min(1, { error: "Topic is required." }),
  wordReference: z.string().min(1, { error: "Reference is required." }),
  direction: z.string(),
})

interface TeamComboboxItemProps {
  team: Team
}

const TeamComboboxItem: FunctionComponent<TeamComboboxItemProps> = ({ team }) => (
  <ComboboxItem value={team}>
    <span className="truncate">{team.name}</span>
  </ComboboxItem>
)

interface UserComboboxItemProps {
  user: User
}

const UserComboboxItem: FunctionComponent<UserComboboxItemProps> = ({ user }) => (
  <ComboboxItem value={user}>
    <Avatar size="sm">
      <AvatarImage src={user.image ?? undefined} alt={user.name} />
      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
    </Avatar>
    <div className="flex min-w-0 flex-col">
      <span className="truncate">{user.name}</span>
      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
    </div>
  </ComboboxItem>
)

interface CreateLineupFormProps {
  onSuccess?: () => void
}

export const CreateLineupForm: FunctionComponent<CreateLineupFormProps> = ({ onSuccess }) => {
  const queryClient = useQueryClient()

  const [teamId, setTeamId] = useState<string | null>(null)
  const [teamInputValue, setTeamInputValue] = useState("")
  const [devoLeaderId, setDevoLeaderId] = useState<string | null>(null)
  const [devoLeaderInputValue, setDevoLeaderInputValue] = useState("")
  const [songs, setSongs] = useState<LineupSongDraft[]>([])
  const [members, setMembers] = useState<LineupMemberDraft[]>([])

  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/teams")
      if (error) throw new Error("Failed to load teams.")
      return data
    },
  })

  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/users")
      if (error) throw new Error("Failed to load users.")
      return data
    },
  })

  const createLineup = useMutation({
    mutationFn: async (values: z.infer<typeof CreateLineupFormSchema>) => {
      // teamId lives outside the Zod schema (it's combobox-driven, not a
      // plain text field) - validated here instead, same as SongUploadForm's
      // required-file check.
      if (!teamId) throw new Error("Please select a team.")

      const { data, error } = await apiClient.POST("/api/lineups", {
        body: {
          serviceType: values.serviceType,
          serviceDate: new Date(values.serviceDate).toISOString(),
          rehearsalDate: values.rehearsalDate ? new Date(values.rehearsalDate).toISOString() : undefined,
          teamId,
          seriesName: values.seriesName,
          topic: values.topic,
          wordReference: values.wordReference,
          direction: values.direction || undefined,
          devoLeaderId: devoLeaderId ?? undefined,
          songIds: songs.map((song) => song.id),
          members: members.map((member) => member.user.id),
        },
      })

      if (error) throw new Error("Failed to create line up.")
      return data
    },
    onSuccess: () => {
      toast.success("Line up created.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["lineups"] })
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      createLineupForm.reset()
      setTeamId(null)
      setTeamInputValue("")
      setDevoLeaderId(null)
      setDevoLeaderInputValue("")
      setSongs([])
      setMembers([])
      onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const createLineupForm = useForm({
    validators: {
      onSubmit: CreateLineupFormSchema,
    },
    defaultValues: {
      serviceType: "" as unknown as LineupServiceType,
      serviceDate: "",
      rehearsalDate: "",
      seriesName: "",
      topic: "",
      wordReference: "",
      direction: "",
    },
    onSubmit: async ({ value }) => {
      // mutateAsync rethrows on failure (its onError above already shows a
      // toast) and TanStack Form's handleSubmit rethrows again on top of
      // that - left uncaught, that becomes an unhandled rejection since the
      // form is submitted via `void handleSubmit()`.
      await createLineup.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <>
      <form
        id="create-lineup-form"
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void createLineupForm.handleSubmit()
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4"
      >
        <Tabs defaultValue="information" className="gap-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="information">Information</TabsTrigger>
            <TabsTrigger value="songs">Songs</TabsTrigger>
            <TabsTrigger value="roster">Singers &amp; Musicians</TabsTrigger>
          </TabsList>

          <TabsContent value="information">
            <FieldGroup>
              <createLineupForm.Field name="serviceType">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Service type</FieldLabel>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          onBlur={field.handleBlur}
                          render={
                            <Button
                              id={field.name}
                              type="button"
                              variant="outline"
                              aria-invalid={isInvalid}
                              className="w-full justify-between font-normal"
                            />
                          }
                        >
                          <span className={field.state.value ? "" : "text-muted-foreground"}>
                            {field.state.value
                              ? formatLineupServiceType(field.state.value)
                              : "Select a service type"}
                          </span>
                          <ChevronDown className="size-4 text-muted-foreground" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-64">
                          <DropdownMenuRadioGroup
                            value={field.state.value}
                            onValueChange={(value: LineupServiceType) => field.handleChange(value)}
                          >
                            {LINEUP_SERVICE_TYPES.map((type) => (
                              <DropdownMenuRadioItem key={type} value={type}>
                                {formatLineupServiceType(type)}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  )
                }}
              </createLineupForm.Field>

              <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
                <createLineupForm.Field name="serviceDate">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>Service date &amp; time</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          type="datetime-local"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    )
                  }}
                </createLineupForm.Field>

                <createLineupForm.Field name="rehearsalDate">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Rehearsal date &amp; time</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="datetime-local"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Optional"
                      />
                    </Field>
                  )}
                </createLineupForm.Field>
              </div>

              <Field>
                <FieldLabel htmlFor="lineup-devo-leader">Devo leader</FieldLabel>
                <Combobox
                  items={users.data ?? []}
                  inputValue={devoLeaderInputValue}
                  onInputValueChange={setDevoLeaderInputValue}
                  itemToStringLabel={(user: User) => user.name}
                  onValueChange={(user: User | null) => {
                    setDevoLeaderId(user?.id ?? null)
                    setDevoLeaderInputValue(user?.name ?? "")
                  }}
                >
                  <ComboboxInput
                    id="lineup-devo-leader"
                    placeholder="Optional - search users..."
                    showClear={!!devoLeaderId}
                    disabled={users.isLoading}
                  />
                  <ComboboxContent className="min-w-(--anchor-width) bg-popover">
                    <ComboboxEmpty>No users found.</ComboboxEmpty>
                    <ComboboxList>
                      {(user: User) => <UserComboboxItem key={user.id} user={user} />}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </Field>

              <Field>
                <FieldLabel htmlFor="lineup-team">Team</FieldLabel>
                <Combobox
                  items={teams.data ?? []}
                  inputValue={teamInputValue}
                  onInputValueChange={setTeamInputValue}
                  itemToStringLabel={(team: Team) => team.name}
                  onValueChange={(team: Team | null) => {
                    setTeamId(team?.id ?? null)
                    setTeamInputValue(team?.name ?? "")

                    // Pre-fills the roster with the team's own members so the
                    // admin isn't re-adding everyone by hand - still fully
                    // editable afterwards (e.g. removing someone who isn't
                    // available for this particular service). Only adds
                    // members not already in the roster, so switching teams
                    // or having manually added someone beforehand never
                    // silently drops them.
                    if (team) {
                      setMembers((current) => {
                        const existingUserIds = new Set(current.map((member) => member.user.id))
                        const additions: LineupMemberDraft[] = team.members
                          .filter((member) => !existingUserIds.has(member.user.id))
                          .map((member) => ({ user: member.user }))
                        return [...current, ...additions]
                      })
                    }
                  }}
                >
                  <ComboboxInput
                    id="lineup-team"
                    placeholder="Search teams..."
                    showClear={!!teamId}
                    disabled={teams.isLoading}
                  >
                    <InputGroupAddon align="inline-start">
                      <Users />
                    </InputGroupAddon>
                  </ComboboxInput>
                  <ComboboxContent className="min-w-(--anchor-width) bg-popover">
                    <ComboboxEmpty>No teams found.</ComboboxEmpty>
                    <ComboboxList>
                      {(team: Team) => <TeamComboboxItem key={team.id} team={team} />}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </Field>

              <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
                <createLineupForm.Field name="seriesName">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>Series name</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                          placeholder="Renewed"
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    )
                  }}
                </createLineupForm.Field>

                <createLineupForm.Field name="topic">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>Topic</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                          placeholder="Walking in Grace"
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    )
                  }}
                </createLineupForm.Field>
              </div>

              <createLineupForm.Field name="wordReference">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Word reference</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="John 3:16"
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  )
                }}
              </createLineupForm.Field>

              <createLineupForm.Field name="direction">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Direction</FieldLabel>
                    <Textarea
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Optional - notes for the team on tone, transitions, etc."
                      className="min-h-20"
                    />
                  </Field>
                )}
              </createLineupForm.Field>
            </FieldGroup>
          </TabsContent>

          <TabsContent value="songs">
            <LineupSongsField songs={songs} onSongsChange={setSongs} />
          </TabsContent>

          <TabsContent value="roster">
            <LineupRosterFields members={members} onMembersChange={setMembers} />
          </TabsContent>
        </Tabs>
      </form>
      <SheetFooter className="flex-row justify-end border-t bg-muted/50">
        <SheetClose render={<Button variant="outline" disabled={createLineup.isPending} />}>
          Cancel
        </SheetClose>
        <Button type="submit" form="create-lineup-form" disabled={createLineup.isPending}>
          {createLineup.isPending ? "Creating..." : "Create line up"}
        </Button>
      </SheetFooter>
    </>
  )
}
