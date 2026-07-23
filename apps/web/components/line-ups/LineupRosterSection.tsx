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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/DropdownMenu"
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

interface MemberDropdownItemProps {
  member: Lineup["members"][number]
  onRemove: () => void
  removeDisabled?: boolean
}

// One roster member's row in the "N members" dropdown - avatar, name, and
// role on the left, a remove button on the right. `closeOnClick={false}` on
// the item itself keeps the menu open after a remove so several members can
// be taken off in one go; the remove button stops propagation so clicking it
// doesn't also trigger the item's own (no-op) select behavior.
const MemberDropdownItem: FunctionComponent<MemberDropdownItemProps> = ({
  member,
  onRemove,
  removeDisabled,
}) => (
  <DropdownMenuItem closeOnClick={false} className="gap-2">
    <Avatar size="sm">
      <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
      <AvatarFallback>{member.user.name.charAt(0)}</AvatarFallback>
    </Avatar>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm">{member.user.name}</p>
    </div>
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
      aria-label={`Remove ${member.user.name} from lineup`}
      disabled={removeDisabled}
      onClick={(e) => {
        e.stopPropagation()
        onRemove()
      }}
    >
      <X className="size-3.5" />
    </Button>
  </DropdownMenuItem>
)

interface LineupRosterSectionProps {
  lineupId: string
  members: Lineup["members"]
}

// The roster avatar stack under the lineup title - who's on it, plus
// search-to-add and hover-to-remove, all scoped to this one lineup
// (independent of team membership, see addLineupMember in
// apps/api/src/services/lineups.ts). Self-contained: given just the
// lineup's id and its current roster, it fetches its own user-search list
// and owns the add/remove mutations, so LineupDetailsView only has to
// assemble it in - not thread roster state through the rest of the page.
// Deliberately doesn't include the lineup's devo leader here - they're a
// single lineup-level field (set via the Update details sheet), not a
// `lineup members` row, so mixing them into this roster's avatar
// stack/count would conflate two different relationships.
export const LineupRosterSection: FunctionComponent<LineupRosterSectionProps> = ({ lineupId, members }) => {
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
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No roster yet.</p>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              />
            }
          >
            {members.length} member{members.length === 1 ? "" : "s"}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Team Members</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {members.map((member) => (
                <MemberDropdownItem
                  key={member.id}
                  member={member}
                  onRemove={() => removeMember.mutate(member.id)}
                  removeDisabled={removeMember.isPending}
                />
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
