"use client"

import { useQuery } from "@tanstack/react-query"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/DropdownMenu"
import { Empty, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { Field, FieldLabel } from "@workspace/ui/components/Field"
import { InputGroupAddon } from "@workspace/ui/components/InputGroup"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronDown, ListMusic, Mic2, Music, Search, X } from "lucide-react"
import Image from "next/image"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type { LineupMemberDraft } from "@/components/line-ups/LineupRosterFields"
import type { Song } from "@/components/songs/NowPlayingCard"
import type { Instrument } from "@/utils/instruments"

const SEARCH_DEBOUNCE_MS = 250

// No `singerId` unless picked - unlike the roster (LineupMemberDraft), a
// song here has an owning entry to attach the assignment to, so the singer
// lives on the draft itself rather than a separate parallel list.
// `hasAlbumArt` is carried over from the search result so SongThumbnail
// knows whether to bother fetching a presigned art URL at all.
export interface LineupSongDraft {
  id: string
  title: string
  artist: string | null
  hasAlbumArt: boolean
  singerId?: string | null
}

interface SongThumbnailProps {
  song: LineupSongDraft
}

// Small square art thumbnail (Music icon fallback) - same shape as
// SongList.tsx's row thumbnail, reused here in place of a plain position
// number so a set list entry looks like the song it actually is.
const SongThumbnail: FunctionComponent<SongThumbnailProps> = ({ song }) => {
  const albumArt = useQuery({
    queryKey: ["song-album-url", song.id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs/{id}/album-url", {
        params: { path: { id: song.id } },
      })
      if (error) throw new Error("Failed to load album art.")
      return data.url
    },
    enabled: song.hasAlbumArt,
  })

  return (
    <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card ring-1 ring-foreground/10">
      {albumArt.data ? (
        <Image
          src={albumArt.data}
          alt={`${song.title} album art`}
          fill
          unoptimized
          className="object-cover"
        />
      ) : (
        <Music className="size-4 text-muted-foreground" />
      )}
    </div>
  )
}

// Sentinel for the "Unassigned" radio option - DropdownMenuRadioGroup values
// are plain strings, and "" can't collide with a real user id.
const UNASSIGNED_SINGER_VALUE = ""

interface SingerRadioItemProps {
  member: LineupMemberDraft
}

// A single roster member's row within the picker - just avatar + name,
// matching how every other user-picker in this app renders a person (e.g.
// UserComboboxItem in CreateLineupForm.tsx).
const SingerRadioItem: FunctionComponent<SingerRadioItemProps> = ({ member }) => (
  <DropdownMenuRadioItem value={member.user.id} closeOnClick className="py-1.5">
    <Avatar size="sm">
      <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
      <AvatarFallback>{member.user.name.charAt(0)}</AvatarFallback>
    </Avatar>
    <span className="truncate">{member.user.name}</span>
  </DropdownMenuRadioItem>
)

interface SongSingerPickerProps {
  song: LineupSongDraft
  singers: LineupMemberDraft[]
  instrumentsByUserId: Map<string, Instrument[]>
  onAssign: (singerId: string | null) => void
}

// Per-song singer picker, sourced from whoever's already been added to the
// roster (Singers & Musicians tab) - this is why that tab comes first in
// CreateLineupForm's tab order, so there's usually someone to pick from by
// the time this tab is reached. A plain radio dropdown (not a Combobox) is
// enough here since the roster is small and already loaded, unlike the
// searched-from-everyone song/user pickers elsewhere in this form. Roster
// members who are actual vocalists (their global instrument profile
// includes "singer") are grouped first, ahead of the rest of the roster,
// since they're who this field is usually for.
const SongSingerPicker: FunctionComponent<SongSingerPickerProps> = ({
  song,
  singers,
  instrumentsByUserId,
  onAssign,
}) => {
  const assignedSinger = singers.find((s) => s.user.id === song.singerId)

  if (singers.length === 0) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled
        aria-label="No one on the roster yet"
        className="rounded-full"
      >
        <Mic2 className="size-3.5" />
      </Button>
    )
  }

  const vocalists = singers.filter((s) => instrumentsByUserId.get(s.user.id)?.includes("singer"))
  const otherMembers = singers.filter((s) => !instrumentsByUserId.get(s.user.id)?.includes("singer"))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-40 justify-start gap-1 font-normal"
          />
        }
      >
        <Mic2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !assignedSinger && "text-muted-foreground")}>
          {assignedSinger ? assignedSinger.user.name : "Singer"}
        </span>
        <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuRadioGroup
          value={song.singerId ?? UNASSIGNED_SINGER_VALUE}
          onValueChange={(value: string) => onAssign(value === UNASSIGNED_SINGER_VALUE ? null : value)}
        >
          <DropdownMenuRadioItem value={UNASSIGNED_SINGER_VALUE} closeOnClick>
            Unassigned
          </DropdownMenuRadioItem>
          {vocalists.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Singers</DropdownMenuLabel>
              {vocalists.map((member) => (
                <SingerRadioItem key={member.user.id} member={member} />
              ))}
            </>
          )}
          {otherMembers.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Other roster</DropdownMenuLabel>
              {otherMembers.map((member) => (
                <SingerRadioItem key={member.user.id} member={member} />
              ))}
            </>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface SongComboboxItemProps {
  song: Song
}

const SongComboboxItem: FunctionComponent<SongComboboxItemProps> = ({ song }) => (
  <ComboboxItem value={song}>
    <Music className="size-4 shrink-0 text-muted-foreground" />
    <div className="flex min-w-0 flex-col">
      <span className="truncate">{song.title}</span>
      <span className="truncate text-xs text-muted-foreground">{song.artist ?? "Unknown artist"}</span>
    </div>
  </ComboboxItem>
)

interface LineupSongsFieldProps {
  songs: LineupSongDraft[]
  onSongsChange: (songs: LineupSongDraft[]) => void
  /** The lineup's current roster, to assign a singer to each song from - see SongSingerPicker. */
  singers: LineupMemberDraft[]
}

// Song search + ordered set-list builder for the create/edit lineup forms -
// mirrors TeamMembershipFields' "search to add, list to manage" shape, but
// this list is order-significant (a song's position in the set list), and
// each entry gets its own singer assignment (see SongSingerPicker).
export const LineupSongsField: FunctionComponent<LineupSongsFieldProps> = ({
  songs,
  onSongsChange,
  singers,
}) => {
  const [inputValue, setInputValue] = useState("")
  const query = useDebouncedValue(inputValue.trim(), SEARCH_DEBOUNCE_MS)

  const results = useQuery({
    queryKey: ["songs-search", query],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs", { params: { query: { q: query } } })
      if (error) throw new Error("Failed to search songs.")
      return data
    },
    enabled: query.length > 0,
  })

  // Only used to tell singers apart from other roster members (and to show
  // everyone's instruments) in SongSingerPicker - mirrors
  // LineupRosterFields.tsx's own instrumentsByUserId lookup.
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

  const availableSongs = (results.data?.items ?? []).filter((song) => !songs.some((s) => s.id === song.id))

  const removeSong = (songId: string) => {
    onSongsChange(songs.filter((s) => s.id !== songId))
  }

  const assignSinger = (songId: string, singerId: string | null) => {
    onSongsChange(songs.map((s) => (s.id === songId ? { ...s, singerId } : s)))
  }

  return (
    <Field>
      <FieldLabel htmlFor="lineup-songs">Songs</FieldLabel>
      <Combobox
        items={availableSongs}
        filter={null}
        inputValue={inputValue}
        onInputValueChange={setInputValue}
        itemToStringLabel={(song: Song) => song.title}
        onValueChange={(song: Song | null) => {
          // No `showClear` on this input, so there's no UI affordance that
          // clears an in-progress selection - `onValueChange` is never
          // actually invoked with null here.
          /* v8 ignore next */
          if (!song) return
          onSongsChange([
            ...songs,
            { id: song.id, title: song.title, artist: song.artist, hasAlbumArt: song.hasAlbumArt },
          ])
          setInputValue("")
        }}
      >
        <ComboboxInput id="lineup-songs" placeholder="Search songs to add...">
          <InputGroupAddon align="inline-start">
            <Search />
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxContent className="min-w-(--anchor-width)">
          <ComboboxEmpty>
            {!query ? "Start typing to search." : results.isFetching ? "Searching..." : "No songs found."}
          </ComboboxEmpty>
          <ComboboxList>{(song: Song) => <SongComboboxItem key={song.id} song={song} />}</ComboboxList>
        </ComboboxContent>
      </Combobox>

      {songs.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {songs.map((song) => {
            const assignedSinger = singers.find((s) => s.user.id === song.singerId)
            return (
              <li key={song.id}>
                <Card size="sm">
                  <CardHeader>
                    <div className="flex min-w-0 items-center gap-2">
                      <SongThumbnail song={song} />
                      <div className="flex min-w-0 flex-col">
                        <CardTitle className="min-w-0 truncate">{song.title}</CardTitle>
                        <span className="truncate text-xs text-muted-foreground">
                          {song.artist ?? "Unknown artist"}
                        </span>
                      </div>
                    </div>
                    <CardAction className="flex items-center gap-1">
                      <SongSingerPicker
                        song={song}
                        singers={singers}
                        instrumentsByUserId={instrumentsByUserId}
                        onAssign={(singerId) => assignSinger(song.id, singerId)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${song.title}`}
                        onClick={() => removeSong(song.id)}
                      >
                        <X className="size-4" />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  {assignedSinger && (
                    <CardContent>
                      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5 ring-1 ring-foreground/10">
                        <Avatar size="sm">
                          <AvatarImage
                            src={assignedSinger.user.image ?? undefined}
                            alt={assignedSinger.user.name}
                          />
                          <AvatarFallback>{assignedSinger.user.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm font-medium">{assignedSinger.user.name}</span>
                      </div>
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
            <ListMusic />
          </EmptyIcon>
          <div className="mt-2">
            <EmptyTitle>No songs added yet</EmptyTitle>
            <EmptyDescription>Search above to build the set list.</EmptyDescription>
          </div>
        </Empty>
      )}
    </Field>
  )
}
