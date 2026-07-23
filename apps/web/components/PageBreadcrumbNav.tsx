"use client"

import { usePathname, useRouter } from "next/navigation"
import type { FunctionComponent } from "react"
import { routeMap } from "@/utils/route-metadata"
import { PageBreadcrumb } from "@workspace/ui/components/Page"
import { useSession } from "./SessionProvider"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/DropdownMenu"
import { authClient } from "@/lib/auth-client"
import { SongSearchCombobox } from "./songs/SongSearchCombobox"

// The layout that renders this is a Server Component - it only runs once
// per full page load, so a pathname read there via headers() goes stale on
// every client-side navigation to a sibling page within the same layout
// (Next reuses the layout's already-rendered output and only swaps the leaf
// segment). usePathname() is a client hook that tracks the router's live
// state instead, so this has to be a client component.
export const PageBreadcrumbNav: FunctionComponent = () => {
  const router = useRouter()
  const pathname = usePathname()
  const session = useSession()
  const imgUrl = session?.user.image as string | undefined
  const userName = session?.user.name as string | undefined

  return (
    <nav className="flex w-full items-center justify-between border-b px-4 py-2.5">
      <PageBreadcrumb pathname={pathname} routes={routeMap} />

      <div className="flex items-center gap-4">
        <SongSearchCombobox />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button>
                <Avatar>
                  <AvatarImage src={imgUrl} />
                  <AvatarFallback className="uppercase">{userName?.charAt(0)}</AvatarFallback>
                </Avatar>
              </button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => router.push("/settings")}>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                authClient.signOut({
                  fetchOptions: {
                    onSuccess() {
                      router.push("/auth/sign-in")
                    },
                  },
                })
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  )
}
