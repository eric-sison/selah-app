"use client"

import { useQueries, useQuery } from "@tanstack/react-query"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import { Empty, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { ScrollArea } from "@workspace/ui/components/ScrollArea"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { Spinner } from "@workspace/ui/components/Spinner"
import { cn } from "@workspace/ui/lib/utils"
import { format } from "date-fns"
import { CalendarX2, ChevronLeft, ListMusic, Music, Pause, Play } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { FunctionComponent, useEffect, useRef } from "react"
import { apiClient } from "@/lib/api-client"
import { NowPlayingCard } from "@/components/songs/NowPlayingCard"
import { usePlayer } from "@/components/songs/SongPlayerProvider"
import { formatLineupServiceType } from "@/utils/lineup-service-type"
import type { Lineup } from "@/components/line-ups/LineupList"
import type { Song } from "@/components/songs/NowPlayingCard"

interface LineupSongRowProps {
  entry: Lineup["songs"][number]
  song: Song | undefined
  isActive: boolean
  isPlaying: boolean
  isLoadingAudio: boolean
  onSelect: () => void
  onTogglePlay: () => void
}

// Mirrors SongList.tsx's own SongRow (thumbnail with a hover play/pause
// overlay, title/artist, key/tempo badges), plus the singer this line up has
// assigned to the song - display-only here, unlike LineupSongList's editable
// SongSingerPicker, since this page is for browsing and playing the set
// list, not building it. `song` (the full Song the player loads separately
// per row) is preferred for key/tempo specifically - the lineup's own copy
// of those fields (`entry.song`) is a snapshot from whenever the lineup
// itself was last fetched, so it goes stale as soon as MusicPlayerBar's key/
// tempo popovers save a change (they only know to invalidate the `["song",
// id]` query, not this page's `["lineup", id]` one). The rest of the row
// renders off `entry.song` immediately, before the per-row fetch resolves.
const LineupSongRow: FunctionComponent<LineupSongRowProps> = ({
  entry,
  song,
  isActive,
  isPlaying,
  isLoadingAudio,
  onSelect,
  onTogglePlay,
}) => {
  // Falls back to the lineup's slim copy only while the full song hasn't
  // loaded yet - once it has, its own (possibly since-cleared) value wins,
  // rather than `??` re-falling-back to a stale non-null snapshot.
  const musicalKey = song ? song.musicalKey : entry.song.musicalKey
  const tempo = song ? song.tempo : entry.song.tempo
  const albumArt = useQuery({
    queryKey: ["song-album-url", entry.song.id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/songs/{id}/album-url", {
        params: { path: { id: entry.song.id } },
      })
      if (error) throw new Error("Failed to load album art.")
      return data.url
    },
    enabled: entry.song.hasAlbumArt,
  })

  const canPlay = !!song

  return (
    <div
      tabIndex={canPlay ? 0 : -1}
      onClick={canPlay ? onSelect : undefined}
      onKeyDown={(e) => {
        if (canPlay && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2 py-2",
        canPlay && "cursor-pointer hover:bg-muted/50",
        isActive && "bg-muted/30"
      )}
    >
      <div className="group relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card opacity-70 ring-1 ring-foreground/10">
        {albumArt.data ? (
          <Image
            src={albumArt.data}
            alt={`${entry.song.title} album art`}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <Music className="size-5 text-muted-foreground" />
        )}
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!canPlay || isLoadingAudio}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePlay()
          }}
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-md bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100",
            (isPlaying || isLoadingAudio) && "opacity-100"
          )}
        >
          {isLoadingAudio ? (
            <Spinner />
          ) : isPlaying ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="size-4 fill-current" />
          )}
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/songs/${entry.song.id}`} className="truncate text-sm font-semibold hover:underline">
            {entry.song.title}
          </Link>
          {musicalKey && (
            <Badge variant="secondary" className="font-mono text-[11px]">
              Key of {musicalKey}
            </Badge>
          )}
          {tempo && (
            <Badge variant="secondary" className="font-mono text-[11px]">
              {tempo} BPM
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{entry.song.artist ?? "Unknown artist"}</p>
      </div>

      {entry.singer && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Avatar size="sm">
            <AvatarImage src={entry.singer.image ?? undefined} alt={entry.singer.name} />
            <AvatarFallback>{entry.singer.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="max-w-24 truncate text-xs text-muted-foreground">{entry.singer.name}</span>
        </div>
      )}
    </div>
  )
}

interface LineupSongListViewProps {
  lineupId: string
}

// The full-page version of the lineup's "Song List" card - same set list,
// but with a music player (NowPlayingCard + MusicPlayerBar, wired the same
// way SongList.tsx wires the song library) instead of the card's
// search/reorder/singer-assignment tools. Reached via the card's "open"
// button in LineupSongList.tsx.
export const LineupSongListView: FunctionComponent<LineupSongListViewProps> = ({ lineupId }) => {
  const { activeSongId, isPlaying, isLoadingSongId, selectSong, playOrToggle } = usePlayer()

  const lineupQuery = useQuery({
    queryKey: ["lineup", lineupId],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/lineups/{id}", {
        params: { path: { id: lineupId } },
      })
      if (error) throw error
      return data
    },
    retry: false,
  })

  const lineup = lineupQuery.data
  const songEntries = lineup?.songs ?? []

  // The lineup's own songs are a slim shape (id/title/artist/key/tempo) -
  // enough for the row itself, but the player needs the full Song record
  // (album art, uploader, etc.), so each entry is re-fetched by id here, the
  // same way SongDetailsView/MusicPlayerBar resolve a song from just its id.
  const songQueries = useQueries({
    queries: songEntries.map((entry) => ({
      queryKey: ["song", entry.song.id],
      queryFn: async () => {
        const { data, error } = await apiClient.GET("/api/songs/{id}", {
          params: { path: { id: entry.song.id } },
        })
        if (error) throw new Error("Failed to load song.")
        return data
      },
    })),
  })

  const loadedSongs = songQueries.map((query) => query.data).filter((song): song is Song => !!song)

  // Loads (but doesn't play) the first song so the mini player/footer bar
  // reflect the same default focus the list itself highlights - only once,
  // mirroring SongList.tsx's equivalent auto-select on the song library page.
  const hasAutoSelectedRef = useRef(false)
  useEffect(() => {
    if (hasAutoSelectedRef.current || activeSongId || !loadedSongs.length) return
    hasAutoSelectedRef.current = true
    selectSong(loadedSongs[0]!, loadedSongs)
  }, [loadedSongs, activeSongId, selectSong])

  const displayActiveId = activeSongId ?? songEntries[0]?.song.id ?? null

  return (
    <div className="flex h-full flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        nativeButton={false}
        render={
          <Link href={`/line-ups/${lineupId}`}>
            <ChevronLeft />
            Line Up
          </Link>
        }
      />

      {lineupQuery.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      ) : lineupQuery.isError || !lineup ? (
        <Empty className="h-full">
          <EmptyIcon>
            <CalendarX2 />
          </EmptyIcon>
          <EmptyTitle>Line up not found</EmptyTitle>
          <EmptyDescription>The requested line up could not be found.</EmptyDescription>
        </Empty>
      ) : (
        <>
          <div>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{lineup.topic ?? "Untitled"}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {format(new Date(lineup.serviceDate), "EEEE, MMMM d, yyyy")} &middot;{" "}
              {formatLineupServiceType(lineup.serviceType)} &middot; {lineup.team.name}
            </p>
          </div>

          {songEntries.length === 0 ? (
            <Empty className="mt-6 min-h-0 flex-1">
              <EmptyIcon>
                <ListMusic />
              </EmptyIcon>
              <EmptyTitle>No songs yet</EmptyTitle>
              <EmptyDescription>Songs added to this line up will show up here.</EmptyDescription>
            </Empty>
          ) : (
            <div className="flex min-h-0 flex-1 gap-6">
              <NowPlayingCard />
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-1">
                  {songEntries.map((entry, index) => {
                    const song = songQueries[index]?.data
                    return (
                      <LineupSongRow
                        key={entry.id}
                        entry={entry}
                        song={song}
                        isActive={displayActiveId === entry.song.id}
                        isPlaying={activeSongId === entry.song.id && isPlaying}
                        isLoadingAudio={isLoadingSongId === entry.song.id}
                        onSelect={() => song && selectSong(song, loadedSongs)}
                        onTogglePlay={() => song && playOrToggle(song, loadedSongs)}
                      />
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </>
      )}
    </div>
  )
}
