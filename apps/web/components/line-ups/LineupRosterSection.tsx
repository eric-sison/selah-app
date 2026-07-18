"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@workspace/ui/components/Avatar"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/Combobox"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@workspace/ui/components/HoverCard"
import { InputGroupAddon } from "@workspace/ui/components/InputGroup"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/Popover"
import { toast } from "@workspace/ui/components/Sonner"
import { Plus, Search, X } from "lucide-react"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import type { Lineup } from "@/components/line-ups/LineupList"
import type { User } from "@/components/teams/TeamMembershipFields"
import { formatInstrument } from "@/utils/instruments"

// Caps how many roster avatars stack before collapsing into a "+N" count -
// mirrors LineupList.tsx's own MAX_VISIBLE_MEMBER_AVATARS.
const MAX_VISIBLE_MEMBER_AVATARS = 20

interface RosterAvatarProps {
  name: string
  image: string | null
  role: string
  isAvailable?: boolean
  onRemove: () => void
  removeDisabled?: boolean
}

// One roster member's avatar within the AvatarGroup - hovering reveals who
// they are, what they play, and a way to take them off the roster without
// leaving the page or opening the edit sheet. `data-slot="avatar"` is
// re-asserted on the HoverCardTrigger's render target because merging the
// trigger's own props onto the Avatar element would otherwise overwrite
// Avatar's own `data-slot="avatar"`, which is what AvatarGroup's sibling-ring
// styling (`*:data-[slot=avatar]:ring-2`) keys off of.
const RosterAvatar: FunctionComponent<RosterAvatarProps> = ({
  name,
  image,
  role,
  isAvailable,
  onRemove,
  removeDisabled,
}) => (
  <HoverCard>
    <HoverCardTrigger
      render={<Avatar data-slot="avatar" role="button" className="outline hover:outline-primary" />}
    >
      <AvatarImage src={image ?? undefined} alt={name} />
      <AvatarFallback>{name.charAt(0)}</AvatarFallback>
    </HoverCardTrigger>
    <HoverCardContent className="w-56">
      <div className="flex items-center gap-2">
        <Avatar>
          <AvatarImage src={image ?? undefined} alt={name} />
          <AvatarFallback>{name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{role}</p>
        </div>
      </div>

      {isAvailable === false && (
        <Badge variant="secondary" className="mt-2">
          Unavailable
        </Badge>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={removeDisabled}
        onClick={onRemove}
        className="mt-2 w-full text-destructive hover:text-destructive"
      >
        <X className="size-3.5" />
        Remove from lineup
      </Button>
    </HoverCardContent>
  </HoverCard>
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
    </div>
  </ComboboxItem>
)

interface AddMemberButtonProps {
  availableUsers: User[]
  usersLoading: boolean
  onAdd: (userId: string) => void
}

// "+" trigger appended to the roster AvatarGroup - same size/ring as an
// avatar so it sits in the stack rather than looking like a bolted-on
// toolbar button. Opens a user search (mirrors LineupRosterFields.tsx's
// combobox) in a Popover instead of a full field, since this only needs to
// be reachable, not a permanent fixture of the page.
const AddMemberButton: FunctionComponent<AddMemberButtonProps> = ({
  availableUsers,
  usersLoading,
  onAdd,
}) => {
  const [inputValue, setInputValue] = useState("")

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Add to roster"
            className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 bg-background text-muted-foreground ring-2 ring-background transition-colors hover:border-primary hover:text-primary"
          />
        }
      >
        <Plus className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Combobox
          items={availableUsers}
          inputValue={inputValue}
          onInputValueChange={setInputValue}
          itemToStringLabel={(user: User) => user.name}
          onValueChange={(user: User | null) => {
            /* v8 ignore next */
            if (!user) return
            onAdd(user.id)
            setInputValue("")
          }}
        >
          <ComboboxInput placeholder="Search members to add..." disabled={usersLoading}>
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
          </ComboboxInput>
          <ComboboxContent className="min-w-(--anchor-width) bg-popover">
            <ComboboxEmpty>No users found.</ComboboxEmpty>
            <ComboboxList>{(user: User) => <UserComboboxItem key={user.id} user={user} />}</ComboboxList>
          </ComboboxContent>
        </Combobox>
      </PopoverContent>
    </Popover>
  )
}

interface LineupRosterSectionProps {
  lineupId: string
  members: Lineup["members"]
  devoLeader: Lineup["devoLeader"]
}

// The roster avatar stack under the lineup title - who's on it, plus
// search-to-add and hover-to-remove, all scoped to this one lineup
// (independent of team membership, see addLineupMember in
// apps/api/src/services/lineups.ts). Self-contained: given just the
// lineup's id and its current roster, it fetches its own user-search list
// and owns the add/remove mutations, so LineupDetailsView only has to
// assemble it in - not thread roster state through the rest of the page.
export const LineupRosterSection: FunctionComponent<LineupRosterSectionProps> = ({
  lineupId,
  members,
  devoLeader,
}) => {
  const queryClient = useQueryClient()
  const invalidateLineup = () => queryClient.invalidateQueries({ queryKey: ["lineup", lineupId] })
  const onMutationError = (error: Error) => toast.error(error.message, { position: "top-center" })

  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/users")
      if (error) throw new Error("Failed to load users.")
      return data
    },
  })

  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await apiClient.POST("/api/lineups/{id}/members", {
        params: { path: { id: lineupId } },
        body: { userId },
      })
      if (error) throw new Error("Failed to add member.")
    },
    onSuccess: invalidateLineup,
    onError: onMutationError,
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await apiClient.DELETE("/api/lineups/{id}/members/{memberId}", {
        params: { path: { id: lineupId, memberId } },
      })
      if (error) throw new Error("Failed to remove member.")
    },
    onSuccess: invalidateLineup,
    onError: onMutationError,
  })

  const availableUsers = (users.data ?? []).filter(
    (user) => !members.some((member) => member.user.id === user.id)
  )

  return (
    <div className="mt-3 flex items-center gap-2">
      <AvatarGroup>
        {members.slice(0, MAX_VISIBLE_MEMBER_AVATARS).map((member) => (
          <RosterAvatar
            key={member.id}
            name={member.user.name}
            image={member.user.image}
            role={
              member.instruments.length > 0
                ? member.instruments.map(formatInstrument).join(", ")
                : "Team member"
            }
            isAvailable={member.isAvailable}
            onRemove={() => removeMember.mutate(member.id)}
            removeDisabled={removeMember.isPending}
          />
        ))}
        {members.length > MAX_VISIBLE_MEMBER_AVATARS && (
          <AvatarGroupCount>+{members.length - MAX_VISIBLE_MEMBER_AVATARS}</AvatarGroupCount>
        )}
        <AddMemberButton
          availableUsers={availableUsers}
          usersLoading={users.isLoading}
          onAdd={(userId) => addMember.mutate(userId)}
        />
      </AvatarGroup>
      {members.length === 0 && !devoLeader ? (
        <p className="text-sm text-muted-foreground">No roster yet.</p>
      ) : (
        <span className="text-sm text-muted-foreground">
          {members.length + (devoLeader ? 1 : 0)} member
          {members.length + (devoLeader ? 1 : 0) === 1 ? "" : "s"}
        </span>
      )}
    </div>
  )
}
