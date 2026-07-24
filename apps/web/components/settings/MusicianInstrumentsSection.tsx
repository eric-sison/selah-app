"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/Card"
import { Empty, EmptyDescription, EmptyTitle } from "@workspace/ui/components/Empty"
import { toast } from "@workspace/ui/components/Sonner"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { formatInstrument, INSTRUMENTS, type Instrument } from "@/utils/instruments"

export const MusicianInstrumentsSection: FunctionComponent = () => {
  const queryClient = useQueryClient()

  const musician = useQuery({
    queryKey: ["musicians", "me"],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET("/api/musicians/me")
      if (error) {
        if (response.status === 404) return null
        throw new Error(error.message ?? "Failed to load your musician profile.")
      }
      return data
    },
  })

  const [draft, setDraft] = useState<Instrument[] | null>(null)
  const instruments = draft ?? musician.data?.instruments ?? []

  const toggleInstrument = (instrument: Instrument) => {
    const current = draft ?? musician.data?.instruments ?? []
    setDraft(
      current.includes(instrument) ? current.filter((i) => i !== instrument) : [...current, instrument]
    )
  }

  const updateInstruments = useMutation({
    mutationFn: async () => {
      const { error } = await apiClient.PATCH("/api/musicians/me", {
        body: { instruments },
      })
      if (error) throw new Error(error.message ?? "Failed to update instruments.")
    },
    onSuccess: () => {
      toast.success("Instruments updated.", { position: "top-center" })
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ["musicians"] })
      queryClient.invalidateQueries({ queryKey: ["teams"] })
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instruments</CardTitle>
        <CardDescription>What you play — used when building team rosters and lineups.</CardDescription>
      </CardHeader>
      <CardContent>
        {musician.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !musician.data ? (
          <Empty>
            <EmptyTitle>Not set up as a musician yet</EmptyTitle>
            <EmptyDescription>Ask an admin to add you as a musician to set your instruments.</EmptyDescription>
          </Empty>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {INSTRUMENTS.map((instrument) => {
              const isSelected = instruments.includes(instrument)
              return (
                <Badge
                  key={instrument}
                  variant={isSelected ? "default" : "outline"}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => toggleInstrument(instrument)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return
                    e.preventDefault()
                    toggleInstrument(instrument)
                  }}
                  className="cursor-pointer select-none"
                >
                  {formatInstrument(instrument)}
                </Badge>
              )
            })}
          </div>
        )}
      </CardContent>
      {musician.data && (
        <CardFooter className="justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => updateInstruments.mutate()}
            disabled={updateInstruments.isPending || draft === null}
          >
            {updateInstruments.isPending ? "Saving..." : "Save instruments"}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
