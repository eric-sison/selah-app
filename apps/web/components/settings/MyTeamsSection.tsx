"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/Badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/Card"
import { Empty, EmptyDescription, EmptyTitle } from "@workspace/ui/components/Empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/Table"
import { FunctionComponent } from "react"
import { apiClient } from "@/lib/api-client"
import { useSession } from "@/components/SessionProvider"

export const MyTeamsSection: FunctionComponent = () => {
  const session = useSession()
  const userId = session?.user.id as string | undefined

  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/teams")
      if (error) throw new Error("Failed to load teams.")
      return data
    },
  })

  const myTeams = (teams.data ?? []).filter(
    (team) => team.leader?.id === userId || team.members.some((m) => m.user.id === userId)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teams</CardTitle>
        <CardDescription>Rosters you belong to.</CardDescription>
      </CardHeader>
      <CardContent>
        {teams.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : myTeams.length === 0 ? (
          <Empty>
            <EmptyTitle>You&apos;re not on any teams yet</EmptyTitle>
            <EmptyDescription>An admin can add you to a team&apos;s roster.</EmptyDescription>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Your role</TableHead>
                <TableHead>Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myTeams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell>
                    <Badge variant={team.leader?.id === userId ? "default" : "secondary"}>
                      {team.leader?.id === userId ? "Leader" : "Member"}
                    </Badge>
                  </TableCell>
                  <TableCell>{team.members.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
