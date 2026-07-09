import { SignUpForm } from "@/components/SignUpForm"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

interface Invitation {
  email: string
  expiresAt: string
}

async function getInvitation(token: string): Promise<Invitation | null> {
  const res = await fetch(`${API_URL}/api/invitations/${encodeURIComponent(token)}`, {
    cache: "no-store",
  })

  if (!res.ok) return null

  return res.json()
}

interface SignUpPageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { token } = await searchParams
  const invitation = token ? await getInvitation(token) : null

  if (!token || !invitation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Invalid or expired invitation</h1>
          <p className="text-muted-foreground mt-2">
            Contact your admin to request a new invitation link.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      <SignUpForm email={invitation.email} token={token} />
    </div>
  )
}
