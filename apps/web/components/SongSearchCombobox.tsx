"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/Combobox"
import { InputGroupAddon } from "@workspace/ui/components/InputGroup"
import { Spinner } from "@workspace/ui/components/Spinner"
import { Music, Search } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type { Song } from "@/components/NowPlayingCard"
import { usePlayer } from "@/components/SongPlayerProvider"

const SEARCH_DEBOUNCE_MS = 250

interface SongSearchResultItemProps {
  song: Song
}

const SongSearchResultItem: FunctionComponent<SongSearchResultItemProps> = ({ song }) => {
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
    <ComboboxItem value={song}>
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card ring-1 ring-foreground/10">
        {albumArt.data ? (
          <Image
            src={albumArt.data}
            alt={`${song.title} album art`}
            width={32}
            height={32}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          <Music className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{song.title}</span>
        <span className="truncate text-xs text-muted-foreground">{song.artist ?? "Unknown artist"}</span>
      </div>
    </ComboboxItem>
  )
}

export const SongSearchCombobox: FunctionComponent = () => {
  const router = useRouter()
  const { selectSong } = usePlayer()
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

  return (
    <Combobox
      items={results.data?.items ?? []}
      filter={null}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringLabel={(song: Song) => song.title}
      onValueChange={(song: Song | null) => {
        if (!song) return
        setInputValue("")
        selectSong(song)
        router.push(`/songs/${song.id}`)
      }}
    >
      <ComboboxInput
        placeholder="Search songs by title or artist..."
        showTrigger={false}
        showClear
        className="w-72"
      >
        <InputGroupAddon align="inline-start">
          <Search />
        </InputGroupAddon>
        {results.isFetching && (
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        )}
      </ComboboxInput>
      <ComboboxContent className="min-w-(--anchor-width)">
        <ComboboxEmpty>
          {query ? (results.isFetching ? "Searching..." : "No songs found.") : "Start typing to search."}
        </ComboboxEmpty>
        <ComboboxList>{(song: Song) => <SongSearchResultItem key={song.id} song={song} />}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
