"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import { Button } from "@workspace/ui/components/Button"
import { Calendar } from "@workspace/ui/components/Calendar"
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/InputGroup"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/Popover"
import { SheetClose, SheetFooter } from "@workspace/ui/components/Sheet"
import { toast } from "@workspace/ui/components/Sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/Tabs"
import { Textarea } from "@workspace/ui/components/Textarea"
import { format } from "date-fns"
import { CalendarIcon, ChevronDown, Clock2, Users } from "lucide-react"
import { FunctionComponent, useState } from "react"
import z from "zod"
import { apiClient } from "@/lib/api-client"
import { LineupRosterFields, type LineupMemberDraft } from "@/components/line-ups/LineupRosterFields"
import type { Lineup } from "@/components/line-ups/LineupList"
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
  teamId: z.string().min(1, { error: "Team is required." }),
  seriesName: z.string(),
  topic: z.string(),
  wordReference: z.string(),
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

interface DateTimePickerProps {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder: string
  ariaInvalid?: boolean
  /** Hide the time section - the value keeps a fixed 00:00 time component. */
  dateOnly?: boolean
}

// Calendar-in-a-popover date & time picker. The value keeps the native
// datetime-local string shape ("yyyy-MM-ddTHH:mm") the plain input it
// replaced produced, so the Zod schema and submit mapping are unchanged -
// only the editing UI differs. Slicing (not date-fns parse) reads the date
// and time parts back out, since the format is fixed.
const DateTimePicker: FunctionComponent<DateTimePickerProps> = ({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  ariaInvalid,
  dateOnly = false,
}) => {
  const [open, setOpen] = useState(false)

  // A datetime-local string has a time component, so `new Date(value)`
  // parses as local time - no UTC-midnight shift (see parseUrlDate in
  // LineupFilterBar.tsx for the date-only counterpart).
  const selected = value ? new Date(value) : undefined
  const timeValue = value ? value.slice(11, 16) : ""

  const handleDateSelect = (day: Date | undefined) => {
    // Single mode reports re-clicking the selected day as `undefined` -
    // treat that as clearing, which the optional rehearsal field needs as
    // its only way to unset a picked value.
    if (!day) {
      onChange("")
      return
    }
    onChange(`${format(day, "yyyy-MM-dd")}T${timeValue || "00:00"}`)

    // A date-only picker (service date) has nothing left to fill in, so
    // picking a day closes the panel immediately. The date+time picker
    // (rehearsal) stays open so the time field below is still reachable -
    // that one closes on Enter instead (see the time input below).
    if (dateOnly) setOpen(false)
  }

  const handleTimeChange = (nextTime: string) => {
    // Picking a time before a date anchors it to today rather than
    // dropping the input; clearing the time falls back to midnight.
    const datePart = value ? value.slice(0, 10) : format(new Date(), "yyyy-MM-dd")
    onChange(`${datePart}T${nextTime || "00:00"}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onBlur={onBlur}
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={ariaInvalid}
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? format(selected, dateOnly ? "MMM d, yyyy" : "MMM d, yyyy 'at' h:mm a") : placeholder}
        </span>
        <CalendarIcon className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) p-0">
        <Calendar
          mode="single"
          className="w-full"
          selected={selected}
          onSelect={handleDateSelect}
          defaultMonth={selected}
        />
        {!dateOnly && (
          <div className="border-t p-3">
            <Field>
              <FieldLabel htmlFor={`${id}-time`}>Time</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`${id}-time`}
                  type="time"
                  value={timeValue}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return
                    // Prevents the Enter keypress from also submitting the
                    // surrounding form - this input's job here is just to
                    // close the panel.
                    e.preventDefault()
                    setOpen(false)
                  }}
                  className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                />
                <InputGroupAddon>
                  <Clock2 className="text-muted-foreground" />
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Converts an ISO timestamp (as returned by the API) into the DateTimePicker's
// native datetime-local string shape ("yyyy-MM-ddTHH:mm") - the inverse of
// the `new Date(values.serviceDate).toISOString()` mapping done on submit.
function toDateTimeLocalValue(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
}

interface CreateLineupFormProps {
  onSuccess?: () => void
  /**
   * When given, the form edits this lineup instead of creating a new one -
   * submitting issues a PATCH instead of a POST. Only the Information tab's
   * fields are editable this way: the update endpoint deliberately excludes
   * songs/roster changes (see updateLineupRoute in
   * apps/api/src/routes/lineups.ts), which go through addLineupSong/
   * removeLineupSong/addLineupMember/removeLineupMember instead - so the
   * Songs and Singers & Musicians tabs are hidden entirely rather than
   * shown as editable but silently not persisted.
   */
  lineup?: Lineup
}

export const CreateLineupForm: FunctionComponent<CreateLineupFormProps> = ({ onSuccess, lineup }) => {
  const queryClient = useQueryClient()
  const isEditing = !!lineup

  const [teamInputValue, setTeamInputValue] = useState(lineup?.team.name ?? "")
  const [devoLeaderId, setDevoLeaderId] = useState<string | null>(lineup?.devoLeader?.id ?? null)
  const [devoLeaderInputValue, setDevoLeaderInputValue] = useState(lineup?.devoLeader?.name ?? "")
  const [songs, setSongs] = useState<LineupSongDraft[]>([])
  const [members, setMembers] = useState<LineupMemberDraft[]>([])

  // Keeps a song's singer assignment in sync with the roster it's drawn
  // from - if someone's removed from the roster (directly, or by switching
  // teams) after being assigned to a song, that assignment is cleared
  // rather than left dangling and invisible (SongSingerPicker only looks
  // up a match within the current `members`, so it'd otherwise show
  // "Assign singer" while the stale id was still submitted underneath).
  const handleMembersChange = (nextMembers: LineupMemberDraft[]) => {
    const nextMemberIds = new Set(nextMembers.map((member) => member.user.id))
    setSongs((current) =>
      current.map((song) =>
        song.singerId && !nextMemberIds.has(song.singerId) ? { ...song, singerId: null } : song
      )
    )
    setMembers(nextMembers)
  }

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
      const body = {
        serviceType: values.serviceType,
        serviceDate: new Date(values.serviceDate).toISOString(),
        rehearsalDate: values.rehearsalDate ? new Date(values.rehearsalDate).toISOString() : undefined,
        teamId: values.teamId,
        seriesName: values.seriesName || undefined,
        topic: values.topic || undefined,
        wordReference: values.wordReference || undefined,
        direction: values.direction || undefined,
        devoLeaderId: devoLeaderId ?? undefined,
      }

      if (isEditing) {
        const { data, error } = await apiClient.PATCH("/api/lineups/{id}", {
          params: { path: { id: lineup.id } },
          body,
        })
        if (error) throw new Error("Failed to update line up.")
        return data
      }

      const { data, error } = await apiClient.POST("/api/lineups", {
        body: {
          ...body,
          songs: songs.map((song) => ({ songId: song.id, singerId: song.singerId ?? undefined })),
          members: members.map((member) => member.user.id),
        },
      })

      if (error) throw new Error("Failed to create line up.")
      return data
    },
    onSuccess: () => {
      toast.success(isEditing ? "Line up updated." : "Line up created.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["lineups"] })
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      if (isEditing) queryClient.invalidateQueries({ queryKey: ["lineup", lineup.id] })
      if (!isEditing) {
        createLineupForm.reset()
        setTeamInputValue("")
        setDevoLeaderId(null)
        setDevoLeaderInputValue("")
        setSongs([])
        setMembers([])
      }
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
      serviceType: lineup?.serviceType ?? ("" as unknown as LineupServiceType),
      serviceDate: lineup ? toDateTimeLocalValue(lineup.serviceDate) : "",
      rehearsalDate: lineup?.rehearsalDate ? toDateTimeLocalValue(lineup.rehearsalDate) : "",
      teamId: lineup?.team.id ?? "",
      seriesName: lineup?.seriesName ?? "",
      topic: lineup?.topic ?? "",
      wordReference: lineup?.wordReference ?? "",
      direction: lineup?.direction ?? "",
    },
    onSubmit: async ({ value }) => {
      // mutateAsync rethrows on failure (its onError above already shows a
      // toast) and TanStack Form's handleSubmit rethrows again on top of
      // that - left uncaught, that becomes an unhandled rejection since the
      // form is submitted via `void handleSubmit()`.
      await createLineup.mutateAsync(value).catch(() => {})
    },
  })

  // Hoisted into a variable rather than inlined twice - edit mode renders
  // this alone (no Tabs, since Songs/Roster aren't editable here - see the
  // `lineup` prop doc comment above), while create mode renders it as the
  // Information tab's content alongside the Songs/Roster tabs.
  const informationFields = (
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
                    {field.state.value ? formatLineupServiceType(field.state.value) : "Select a service type"}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64">
                  <DropdownMenuRadioGroup
                    value={field.state.value}
                    onValueChange={(value: LineupServiceType) => field.handleChange(value)}
                  >
                    {LINEUP_SERVICE_TYPES.map((type) => (
                      <DropdownMenuRadioItem key={type} value={type} closeOnClick>
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
                <FieldLabel htmlFor={field.name}>Service date</FieldLabel>
                <DateTimePicker
                  id={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  ariaInvalid={isInvalid}
                  placeholder="Pick a date"
                  dateOnly
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
              <DateTimePicker
                id={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
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
            <ComboboxList>{(user: User) => <UserComboboxItem key={user.id} user={user} />}</ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>

      <createLineupForm.Field name="teamId">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="lineup-team">Team</FieldLabel>
              <Combobox
                items={teams.data ?? []}
                inputValue={teamInputValue}
                onInputValueChange={setTeamInputValue}
                itemToStringLabel={(team: Team) => team.name}
                onValueChange={(team: Team | null) => {
                  field.handleChange(team?.id ?? "")
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
                  showClear={!!field.state.value}
                  disabled={teams.isLoading}
                  aria-invalid={isInvalid}
                  onBlur={field.handleBlur}
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
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      </createLineupForm.Field>

      <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
        <createLineupForm.Field name="seriesName">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Series name</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Optional - Renewed"
              />
            </Field>
          )}
        </createLineupForm.Field>

        <createLineupForm.Field name="topic">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Topic</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Optional - Walking in Grace"
              />
            </Field>
          )}
        </createLineupForm.Field>
      </div>

      <createLineupForm.Field name="wordReference">
        {(field) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Word reference</FieldLabel>
            <Input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="Optional - John 3:16"
            />
          </Field>
        )}
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
  )

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
        {isEditing ? (
          informationFields
        ) : (
          <Tabs defaultValue="information" className="gap-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="information">Information</TabsTrigger>
              <TabsTrigger value="roster">Singers &amp; Musicians</TabsTrigger>
              <TabsTrigger value="songs">Songs</TabsTrigger>
            </TabsList>

            <TabsContent value="information">{informationFields}</TabsContent>

            <TabsContent value="roster">
              <LineupRosterFields members={members} onMembersChange={handleMembersChange} />
            </TabsContent>

            <TabsContent value="songs">
              <LineupSongsField songs={songs} onSongsChange={setSongs} singers={members} />
            </TabsContent>
          </Tabs>
        )}
      </form>
      <SheetFooter className="flex-row justify-end border-t bg-muted/50">
        <SheetClose render={<Button variant="outline" disabled={createLineup.isPending} />}>
          Cancel
        </SheetClose>
        <Button type="submit" form="create-lineup-form" disabled={createLineup.isPending}>
          {createLineup.isPending
            ? isEditing
              ? "Saving..."
              : "Creating..."
            : isEditing
              ? "Save changes"
              : "Create line up"}
        </Button>
      </SheetFooter>
    </>
  )
}
