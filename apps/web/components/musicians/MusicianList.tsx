"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@workspace/ui/components/AlertDialog"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/Card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/DropdownMenu"
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@workspace/ui/components/Empty"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { toast } from "@workspace/ui/components/Sonner"
import { Spinner } from "@workspace/ui/components/Spinner"
import { EllipsisVertical, Mic2, Trash } from "lucide-react"
import { FunctionComponent, MouseEvent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { CreateMusicianSheet } from "@/components/musicians/CreateMusicianSheet"
import { EditMusicianInstrumentsDialog } from "@/components/musicians/EditMusicianInstrumentsDialog"
import { useSession } from "@/components/SessionProvider"
import { formatInstrument } from "@/utils/instruments"
import type { operations } from "@/types/api"

export type Musician = operations["listMusicians"]["responses"][200]["content"]["application/json"][number]

const SKELETON_CARD_COUNT = 15

const MusicianCardSkeleton: FunctionComponent = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-48" />
    </CardHeader>
    <CardContent className="flex items-center gap-1.5">
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-5 w-16 rounded-full" />
    </CardContent>
  </Card>
)

interface MusicianCardProps {
  musician: Musician
}

// Stops a click (including one inside the dropdown menu or the delete
// confirmation) from bubbling up to the card - see TeamList.tsx's TeamCard
// for the same guard.
const stop = (e: MouseEvent) => e.stopPropagation()

const MusicianCard: FunctionComponent<MusicianCardProps> = ({ musician }) => {
  const session = useSession()
  const isAdmin = session?.user.role === "admin"
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const deleteMusician = useMutation({
    mutationFn: async () => {
      const { error } = await apiClient.DELETE("/api/musicians/{id}", {
        params: { path: { id: musician.id } },
      })
      // Surfaces the API's own message (rather than a generic one) since a
      // 409 here - the musician is still on a team - has a specific,
      // actionable reason worth showing as-is.
      if (error) throw new Error(error.message ?? "Failed to delete musician profile.")
    },
    onSuccess: () => {
      toast.success("Musician profile deleted.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["musicians"] })
      setDeleteDialogOpen(false)
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex min-w-0 items-center gap-2">
            <Avatar size="lg">
              <AvatarImage src={musician.user.image ?? undefined} alt={musician.user.name} />
              <AvatarFallback>{musician.user.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <CardTitle className="min-w-0 truncate">{musician.user.name}</CardTitle>
              <CardDescription className="truncate text-xs">{musician.user.email}</CardDescription>
            </div>
          </div>
          {isAdmin && (
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                      aria-label="Musician options"
                      onClick={stop}
                    />
                  }
                >
                  <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={stop}>
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit instruments</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {musician.instruments.length > 0 ? (
            musician.instruments.map((instrument) => (
              <Badge key={instrument} variant="outline">
                {formatInstrument(instrument)}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No instruments yet</span>
          )}
        </CardContent>
      </Card>

      <EditMusicianInstrumentsDialog musician={musician} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(next) => {
          if (!deleteMusician.isPending) setDeleteDialogOpen(next)
        }}
      >
        <AlertDialogContent onClick={stop} size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Delete &quot;{musician.user.name}&quot;&apos;s musician profile?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes their instruments and takes them out of the team member picker. This action cannot
              be undone. If they&apos;re still on a team, remove them from it first - this is blocked while
              any membership remains.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMusician.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMusician.isPending}
              onClick={() => deleteMusician.mutate()}
            >
              {deleteMusician.isPending && <Spinner />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export const MusicianList: FunctionComponent = () => {
  const musicians = useQuery({
    queryKey: ["musicians"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/musicians")
      if (error) throw new Error("Failed to load musicians.")
      return data
    },
  })

  if (musicians.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <MusicianCardSkeleton key={index} />
        ))}
      </div>
    )
  }

  if (!musicians.data?.length) {
    return (
      <Empty className="min-h-0">
        <EmptyIcon>
          <Mic2 />
        </EmptyIcon>
        <EmptyTitle>No musicians yet</EmptyTitle>
        <EmptyDescription>Create a musician profile to start assigning instruments.</EmptyDescription>
        <EmptyAction>
          <CreateMusicianSheet />
        </EmptyAction>
      </Empty>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
      {musicians.data.map((musician) => (
        <MusicianCard key={musician.id} musician={musician} />
      ))}
    </div>
  )
}
