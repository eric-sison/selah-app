"use client"

import { useQuery } from "@tanstack/react-query"
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
import { Search, UsersRound, X } from "lucide-react"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import type { User } from "@/components/teams/TeamMembershipFields"
import { formatInstrument } from "@/utils/instruments"

// Deliberately smaller than `User` - a draft's `user` can come from either
// the full users list (search-to-add) or a team's already-embedded member
// (auto-populated from the selected team, see CreateLineupForm.tsx), which
// only ever carries id/name/image, not email. Mirrors TeamMemberUser in
// TeamMembershipFields.tsx.
export interface LineupRosterUser {
  id: string
  name: string
  image: string | null
}

// No role of its own - a lineup member's role(s) are read-only, carried
// over from their team_member_roles for the lineup's team (see
// apps/api/src/routes/lineups.ts's mapLineup), so there's nothing to pick
// here beyond who's on the roster.
export interface LineupMemberDraft {
  user: LineupRosterUser
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

interface LineupRosterFieldsProps {
  members: LineupMemberDraft[]
  onMembersChange: (members: LineupMemberDraft[]) => void
}

// Singer/musician roster picker for the create/edit lineup forms - same
// "search to add, list to manage" shape as LineupSongsField, but for users.
// Roster membership is independent of team membership (see addLineupMember
// in apps/api/src/services/lineups.ts) - any user can be added regardless
// of the team assigned above; their displayed role(s) are just resolved
// from the team roster after saving, not chosen here.
export const LineupRosterFields: FunctionComponent<LineupRosterFieldsProps> = ({
  members,
  onMembersChange,
}) => {
  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/users")
      if (error) throw new Error("Failed to load users.")
      return data
    },
  })

  // Only used to look up a roster member's instruments for display - not
  // every user on the roster is a musician (e.g. singers with no instrument
  // profile), so this is a best-effort map rather than a required join.
  const musicians = useQuery({
    queryKey: ["musicians"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/musicians")
      if (error) throw new Error("Failed to load musicians.")
      return data
    },
  })

  const instrumentsByUserId = new Map(
    (musicians.data ?? []).map((musician) => [musician.user.id, musician.instruments])
  )

  const [inputValue, setInputValue] = useState("")

  const availableUsers = (users.data ?? []).filter((user) => !members.some((m) => m.user.id === user.id))

  const removeMember = (userId: string) => {
    onMembersChange(members.filter((member) => member.user.id !== userId))
  }

  return (
    <Field>
      <FieldLabel htmlFor="lineup-roster">Singers &amp; musicians</FieldLabel>
      <Combobox
        items={availableUsers}
        inputValue={inputValue}
        onInputValueChange={setInputValue}
        itemToStringLabel={(user: User) => user.name}
        onValueChange={(user: User | null) => {
          // No `showClear` on this input, so there's no UI affordance that
          // clears an in-progress selection - `onValueChange` is never
          // actually invoked with null here.
          /* v8 ignore next */
          if (!user) return
          onMembersChange([...members, { user }])
          setInputValue("")
        }}
      >
        <ComboboxInput id="lineup-roster" placeholder="Search users to add..." disabled={users.isLoading}>
          <InputGroupAddon align="inline-start">
            <Search />
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxContent className="min-w-(--anchor-width) bg-popover">
          <ComboboxEmpty>No users found.</ComboboxEmpty>
          <ComboboxList>{(user: User) => <UserComboboxItem key={user.id} user={user} />}</ComboboxList>
        </ComboboxContent>
      </Combobox>

      {members.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {members.map((member) => {
            const instruments = instrumentsByUserId.get(member.user.id) ?? []
            return (
              <li key={member.user.id}>
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
                        onClick={() => removeMember(member.user.id)}
                      >
                        <X className="size-4" />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  {instruments.length > 0 && (
                    <CardContent className="flex flex-wrap gap-1.5">
                      {instruments.map((instrument) => (
                        <Badge key={instrument} variant="secondary">
                          {formatInstrument(instrument)}
                        </Badge>
                      ))}
                    </CardContent>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty className="mt-3 min-h-0 gap-1 rounded-lg py-6">
          <EmptyIcon className="mb-0 [&>svg]:size-20">
            <UsersRound />
          </EmptyIcon>
          <div className="mt-2">
            <EmptyTitle>No one added yet</EmptyTitle>
            <EmptyDescription>Search above to build the roster.</EmptyDescription>
          </div>
        </Empty>
      )}
    </Field>
  )
}
