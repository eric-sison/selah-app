"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/Card"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/Combobox"
import { Empty, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { Field, FieldLabel } from "@workspace/ui/components/Field"
import { InputGroupAddon } from "@workspace/ui/components/InputGroup"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/Popover"
import { toast } from "@workspace/ui/components/Sonner"
import { HeadphoneOff, Search, UserRoundSearch, X } from "lucide-react"
import { FunctionComponent, useEffect, useRef, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { formatInstrument, INSTRUMENTS, type Instrument } from "@/utils/instruments"
import type { Musician } from "@/components/musicians/MusicianList"
import type { operations } from "@/types/api"

export type User = operations["listUsers"]["responses"][200]["content"]["application/json"][number]

// Deliberately smaller than `Musician` - a draft's `user` can come from
// either the musicians list (create flow) or a team's already-embedded
// member (edit flow, see TeamMemberResponseSchema in
// apps/api/src/routes/teams.ts), which only ever carries id/name/image, not
// email.
export interface TeamMemberDraft {
  musicianId: string
  user: { id: string; name: string; image: string | null }
  instruments: Instrument[]
}

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

interface MusicianComboboxItemProps {
  musician: Musician
}

const MusicianComboboxItem: FunctionComponent<MusicianComboboxItemProps> = ({ musician }) => (
  <ComboboxItem value={musician}>
    <Avatar size="sm">
      <AvatarImage src={musician.user.image ?? undefined} alt={musician.user.name} />
      <AvatarFallback>{musician.user.name.charAt(0)}</AvatarFallback>
    </Avatar>
    <div className="flex min-w-0 flex-col">
      <span className="truncate">{musician.user.name}</span>
      <span className="truncate text-xs text-muted-foreground">{musician.user.email}</span>
    </div>
  </ComboboxItem>
)

interface TeamMembershipFieldsProps {
  /** Seeds the leader combobox's display text - only needed when editing an already-assigned leader. */
  initialLeaderName?: string
  teamLeaderId: string | null
  onTeamLeaderIdChange: (id: string | null) => void
  members: TeamMemberDraft[]
  onMembersChange: (members: TeamMemberDraft[]) => void
  /** Focuses the musicians search input on mount - set when this field group was opened specifically to add a member (e.g. from the "Add member" empty-state action). */
  autoFocusMembers?: boolean
}

// The "team leader" + "musicians" pickers shared by CreateTeamForm and
// EditTeamForm - identical UI either way, only the initial values and what
// happens on submit differ between the two callers.
export const TeamMembershipFields: FunctionComponent<TeamMembershipFieldsProps> = ({
  initialLeaderName,
  teamLeaderId,
  onTeamLeaderIdChange,
  members,
  onMembersChange,
  autoFocusMembers,
}) => {
  const queryClient = useQueryClient()

  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/users")
      if (error) throw new Error("Failed to load users.")
      return data
    },
  })

  // A team member has to already be a musician - see the Musicians page for
  // creating a new profile. This only lists existing ones to add from.
  const musicians = useQuery({
    queryKey: ["musicians"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/musicians")
      if (error) throw new Error("Failed to load musicians.")
      return data
    },
  })

  const updateInstruments = useMutation({
    mutationFn: async ({ musicianId, instruments }: { musicianId: string; instruments: Instrument[] }) => {
      const { error } = await apiClient.PATCH("/api/musicians/{id}", {
        params: { path: { id: musicianId } },
        body: { instruments },
      })
      if (error) throw new Error("Failed to update instruments.")
    },
    onSuccess: (_data, { musicianId, instruments }) => {
      onMembersChange(
        members.map((member) => (member.musicianId === musicianId ? { ...member, instruments } : member))
      )
      queryClient.invalidateQueries({ queryKey: ["musicians"] })
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const [leaderInputValue, setLeaderInputValue] = useState(initialLeaderName ?? "")
  const [memberInputValue, setMemberInputValue] = useState("")

  // The musicians input is `disabled` (see below) until `musicians` resolves,
  // so focusing on plain mount would silently no-op on a disabled element -
  // this waits for loading to finish, and `hasAutoFocusedRef` keeps it from
  // re-focusing on a later refetch once that's happened.
  const hasAutoFocusedRef = useRef(false)
  useEffect(() => {
    if (!autoFocusMembers || musicians.isLoading || hasAutoFocusedRef.current) return
    hasAutoFocusedRef.current = true
    document.getElementById("team-members")?.focus()
  }, [autoFocusMembers, musicians.isLoading])

  const availableMusicians = (musicians.data ?? []).filter(
    (musician) => !members.some((m) => m.musicianId === musician.id)
  )

  const removeMember = (musicianId: string) => {
    onMembersChange(members.filter((member) => member.musicianId !== musicianId))
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor="team-leader">Team leader</FieldLabel>
        <Combobox
          items={users.data ?? []}
          inputValue={leaderInputValue}
          onInputValueChange={setLeaderInputValue}
          itemToStringLabel={(user: User) => user.name}
          onValueChange={(user: User | null) => {
            onTeamLeaderIdChange(user?.id ?? null)
            setLeaderInputValue(user?.name ?? "")
          }}
        >
          <ComboboxInput
            id="team-leader"
            placeholder="Optional - search users..."
            showClear={!!teamLeaderId}
            disabled={users.isLoading}
          >
            <InputGroupAddon align="inline-start">
              <UserRoundSearch />
            </InputGroupAddon>
          </ComboboxInput>
          <ComboboxContent className="min-w-(--anchor-width) bg-popover">
            <ComboboxEmpty>No users found.</ComboboxEmpty>
            <ComboboxList>{(user: User) => <UserComboboxItem key={user.id} user={user} />}</ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>

      <Field>
        <FieldLabel htmlFor="team-members">Musicians</FieldLabel>
        <Combobox
          items={availableMusicians}
          inputValue={memberInputValue}
          onInputValueChange={setMemberInputValue}
          itemToStringLabel={(musician: Musician) => musician.user.name}
          onValueChange={(musician: Musician | null) => {
            // Unlike the leader combobox, this one has no `showClear` -
            // there's no UI affordance that clears an in-progress selection,
            // so `onValueChange` is never actually invoked with null here.
            /* v8 ignore next */
            if (!musician) return
            onMembersChange([
              ...members,
              { musicianId: musician.id, user: musician.user, instruments: musician.instruments },
            ])
            setMemberInputValue("")
          }}
        >
          <ComboboxInput
            id="team-members"
            placeholder="Search musicians to add..."
            disabled={musicians.isLoading}
          >
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
          </ComboboxInput>
          <ComboboxContent className="min-w-(--anchor-width) bg-popover">
            <ComboboxEmpty>No musicians found.</ComboboxEmpty>
            <ComboboxList>
              {(musician: Musician) => <MusicianComboboxItem key={musician.id} musician={musician} />}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        {members.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-4 rounded-2xl">
            {members.map((member) => (
              <li key={member.musicianId}>
                <Card size="sm">
                  <CardHeader>
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar size="sm">
                        <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
                        <AvatarFallback>{member.user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <CardTitle className="min-w-0 truncate">{member.user.name}</CardTitle>
                    </div>
                    <CardAction>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${member.user.name}`}
                        onClick={() => removeMember(member.musicianId)}
                      >
                        <X className="size-4" />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <Popover>
                      <PopoverTrigger
                        render={
                          <button
                            type="button"
                            className="flex w-full flex-wrap items-center gap-1 rounded-md border border-dashed border-input p-1.5 text-left transition-colors hover:bg-accent/50"
                          >
                            {member.instruments.length > 0 ? (
                              member.instruments.map((instrument) => (
                                <Badge key={instrument} variant="secondary">
                                  {formatInstrument(instrument)}
                                </Badge>
                              ))
                            ) : (
                              <span className="px-1 text-xs text-muted-foreground">Add instruments</span>
                            )}
                          </button>
                        }
                      />
                      <PopoverContent align="start" className="w-56 flex-row flex-wrap gap-1.5">
                        {INSTRUMENTS.map((instrument) => {
                          const isSelected = member.instruments.includes(instrument)
                          const toggle = () => {
                            const next = isSelected
                              ? member.instruments.filter((i) => i !== instrument)
                              : [...member.instruments, instrument]
                            updateInstruments.mutate({ musicianId: member.musicianId, instruments: next })
                          }
                          return (
                            <Badge
                              key={instrument}
                              variant={isSelected ? "default" : "outline"}
                              role="button"
                              tabIndex={0}
                              aria-pressed={isSelected}
                              onClick={toggle}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter" && e.key !== " ") return
                                e.preventDefault()
                                toggle()
                              }}
                              className="cursor-pointer select-none"
                            >
                              {formatInstrument(instrument)}
                            </Badge>
                          )
                        })}
                      </PopoverContent>
                    </Popover>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Empty className="mt-10 min-h-0 gap-1 rounded-lg py-6">
            <EmptyIcon className="mb-0 [&>svg]:size-20">
              <HeadphoneOff />
            </EmptyIcon>
            <div className="mt-2">
              <EmptyTitle>No musicians added yet</EmptyTitle>
              <EmptyDescription>Search above to add someone to the roster.</EmptyDescription>
            </div>
          </Empty>
        )}
      </Field>
    </>
  )
}
