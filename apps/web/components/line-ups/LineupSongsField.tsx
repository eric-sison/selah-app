"use client"

import { useQuery } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/Button"
import { Card, CardAction, CardHeader, CardTitle } from "@workspace/ui/components/Card"
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
import { ListMusic, Music, Search, X } from "lucide-react"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type { Song } from "@/components/songs/NowPlayingCard"

const SEARCH_DEBOUNCE_MS = 250

export interface LineupSongDraft {
  id: string
  title: string
  artist: string | null
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
}

// Song search + ordered set-list builder for the create/edit lineup forms -
// mirrors TeamMembershipFields' "search to add, list to manage" shape, but
// this list is order-significant (a song's position in the set list).
export const LineupSongsField: FunctionComponent<LineupSongsFieldProps> = ({ songs, onSongsChange }) => {
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

  const availableSongs = (results.data?.items ?? []).filter((song) => !songs.some((s) => s.id === song.id))

  const removeSong = (songId: string) => {
    onSongsChange(songs.filter((s) => s.id !== songId))
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
          if (!song) return
          onSongsChange([...songs, { id: song.id, title: song.title, artist: song.artist }])
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
          {songs.map((song, index) => (
            <li key={song.id}>
              <Card size="sm">
                <CardHeader>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <CardTitle className="min-w-0 truncate">{song.title}</CardTitle>
                      <span className="truncate text-xs text-muted-foreground">
                        {song.artist ?? "Unknown artist"}
                      </span>
                    </div>
                  </div>
                  <CardAction>
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
              </Card>
            </li>
          ))}
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
