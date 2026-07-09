import { SignInForm } from "@/components/SignInForm"
import { isSafeRedirectTarget } from "@/utils/is-safe-redirect"

interface SignInPageProps {
  searchParams: Promise<{ redirect?: string; error?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { redirect, error } = await searchParams
  const callbackURL = isSafeRedirectTarget(redirect) ? redirect : "/"

  return (
    <div className="flex h-full items-center justify-center">
      <SignInForm callbackURL={callbackURL} error={error} />
    </div>
  )
}
