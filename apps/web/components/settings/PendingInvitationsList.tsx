"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/Card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/Table"
import { toast } from "@workspace/ui/components/Sonner"
import { format } from "date-fns"
import { FunctionComponent } from "react"
import { apiClient } from "@/lib/api-client"

export const PendingInvitationsList: FunctionComponent = () => {
  const queryClient = useQueryClient()

  const invitations = useQuery({
    queryKey: ["invitations"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/invitations")
      if (error) throw new Error(error.message ?? "Failed to load invitations.")
      return data
    },
  })

  const revokeInvitation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await apiClient.DELETE("/api/invitations/{id}", {
        params: { path: { id } },
      })
      if (error) throw new Error(error.message ?? "Failed to revoke invitation.")
    },
    onSuccess: () => {
      toast.success("Invitation revoked.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
        <CardDescription>Sent, not yet accepted.</CardDescription>
      </CardHeader>
      <CardContent>
        {invitations.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !invitations.data || invitations.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Invited by</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.data.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{invitation.role}</Badge>
                  </TableCell>
                  <TableCell>{invitation.invitedBy.name}</TableCell>
                  <TableCell>{format(new Date(invitation.expiresAt), "PP p")}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeInvitation.mutate(invitation.id)}
                      disabled={revokeInvitation.isPending}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
