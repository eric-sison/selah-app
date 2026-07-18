"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import { Button } from "@workspace/ui/components/Button"
import { CardContent, CardHeader, CardTitle } from "@workspace/ui/components/Card"
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
import { InputGroupAddon } from "@workspace/ui/components/InputGroup"
import { toast } from "@workspace/ui/components/Sonner"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronDown, Mic2, Music, Search, X } from "lucide-react"
import Image from "next/image"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type { Lineup } from "@/components/line-ups/LineupList"
import type { Song } from "@/components/songs/NowPlayingCard"

const SONG_SEARCH_DEBOUNCE_MS = 250

interface SongThumbnailProps {
  song: { id: string; title: string; hasAlbumArt: boolean }
}

// Small square art thumbnail (Music icon fallback) in place of the set list
// position number - same shape as LineupSongsField.tsx's SongThumbnail.
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
  member: Lineup["members"][number]
}

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
  members: Lineup["members"]
  singer: { id: string; name: string; image: string | null } | null
  disabled?: boolean
  onAssign: (singerId: string | null) => void
}

// Per-song singer picker, sourced from the lineup's own roster - mirrors
// LineupSongsField.tsx's SongSingerPicker (vocalists grouped ahead of the
// rest of the roster), but wired to mutate the live lineup directly from the
// detail page instead of a local create/edit-form draft. Selecting
// "Unassigned" clears the singer, so reassigning or removing one doesn't
// need a separate control.
const SongSingerPicker: FunctionComponent<SongSingerPickerProps> = ({
  members,
  singer,
  disabled,
  onAssign,
}) => {
  if (members.length === 0) {
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

  const vocalists = members.filter((member) => member.instruments.includes("singer"))
  const otherMembers = members.filter((member) => !member.instruments.includes("singer"))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="w-40 justify-start gap-2 font-normal"
          />
        }
      >
        <Mic2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !singer && "text-muted-foreground")}>
          {singer ? singer.name : "Assign a singer"}
        </span>
        <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuRadioGroup
          value={singer?.id ?? UNASSIGNED_SINGER_VALUE}
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
                <SingerRadioItem key={member.id} member={member} />
              ))}
            </>
          )}
          {otherMembers.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Other members</DropdownMenuLabel>
              {otherMembers.map((member) => (
                <SingerRadioItem key={member.id} member={member} />
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

interface LineupSongListProps {
  lineupId: string
  songs: Lineup["songs"]
  members: Lineup["members"]
}

// The "Song List" card section - search-to-add, an ordered set list with
// each song's key/tempo and singer assignment, and a remove button per row.
// Self-contained: given the lineup's id and its current songs/roster, it
// owns its own search state and the add/remove/assign-singer mutations, so
// LineupDetailsView only has to assemble it in as one of the card's two
// CardContent sections (see LineupDiscussion for the other). Renders its
// own CardHeader/CardContent rather than a full Card, since both sections
// share one Card wrapper with a Separator between them.
export const LineupSongList: FunctionComponent<LineupSongListProps> = ({ lineupId, songs, members }) => {
  const queryClient = useQueryClient()
  const invalidateLineup = () => queryClient.invalidateQueries({ queryKey: ["lineup", lineupId] })
  const onMutationError = (error: Error) => toast.error(error.message, { position: "top-center" })

  const [songSearchValue, setSongSearchValue] = useState("")
  const songSearchQuery = useDebouncedValue(songSearchValue.trim(), SONG_SEARCH_DEBOUNCE_MS)

  const songResults = useQuery({
    queryKey: ["songs-search", songSearchQuery],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs", {
        params: { query: { q: songSearchQuery } },
      })
      if (error) throw new Error("Failed to search songs.")
      return data
    },
    enabled: songSearchQuery.length > 0,
  })

  const updateSongSinger = useMutation({
    mutationFn: async ({ songId, singerId }: { songId: string; singerId: string | null }) => {
      const { error } = await apiClient.PATCH("/api/lineups/{id}/songs/{songId}", {
        params: { path: { id: lineupId, songId } },
        body: { singerId },
      })
      if (error) throw new Error("Failed to update singer.")
    },
    onSuccess: invalidateLineup,
    onError: onMutationError,
  })

  const addSong = useMutation({
    mutationFn: async (songId: string) => {
      const { error } = await apiClient.POST("/api/lineups/{id}/songs", {
        params: { path: { id: lineupId } },
        body: { songId },
      })
      if (error) throw new Error("Failed to add song.")
    },
    onSuccess: () => {
      invalidateLineup()
      setSongSearchValue("")
    },
    onError: onMutationError,
  })

  const removeSong = useMutation({
    mutationFn: async (songId: string) => {
      const { error } = await apiClient.DELETE("/api/lineups/{id}/songs/{songId}", {
        params: { path: { id: lineupId, songId } },
      })
      if (error) throw new Error("Failed to remove song.")
    },
    onSuccess: invalidateLineup,
    onError: onMutationError,
  })

  const availableSongs = (songResults.data?.items ?? []).filter(
    (song) => !songs.some((entry) => entry.song.id === song.id)
  )

  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Music className="size-4" />
          Song List
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Combobox
          items={availableSongs}
          filter={null}
          inputValue={songSearchValue}
          onInputValueChange={setSongSearchValue}
          itemToStringLabel={(song: Song) => song.title}
          onValueChange={(song: Song | null) => {
            /* v8 ignore next */
            if (!song) return
            addSong.mutate(song.id)
          }}
        >
          <ComboboxInput placeholder="Search songs to add...">
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
          </ComboboxInput>
          <ComboboxContent className="min-w-(--anchor-width)">
            <ComboboxEmpty>
              {!songSearchQuery
                ? "Start typing to search."
                : songResults.isFetching
                  ? "Searching..."
                  : "No songs found."}
            </ComboboxEmpty>
            <ComboboxList>{(song: Song) => <SongComboboxItem key={song.id} song={song} />}</ComboboxList>
          </ComboboxContent>
        </Combobox>

        {songs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No songs yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-border">
            {songs.map((entry) => {
              const meta = [
                entry.song.musicalKey ? `Key of ${entry.song.musicalKey}` : null,
                entry.song.tempo ? `${entry.song.tempo} BPM` : null,
              ]
                .filter(Boolean)
                .join(" · ")

              return (
                <li key={entry.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <SongThumbnail song={entry.song} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entry.song.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.song.artist ?? "Unknown artist"}
                    </p>
                  </div>
                  {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
                  <SongSingerPicker
                    members={members}
                    singer={entry.singer}
                    disabled={updateSongSinger.isPending}
                    onAssign={(singerId) => updateSongSinger.mutate({ songId: entry.song.id, singerId })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${entry.song.title}`}
                    disabled={removeSong.isPending}
                    onClick={() => removeSong.mutate(entry.song.id)}
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </>
  )
}
