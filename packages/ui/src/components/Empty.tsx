import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn("flex flex-1 flex-col items-center justify-center gap-1 text-center", className)}
      {...props}
    />
  )
}

// Sized/colored via a descendant selector (matches Button's own icon
// handling) rather than cloning the child, so any lucide icon can be
// dropped in as-is: `<EmptyIcon><Users /></EmptyIcon>`. `mb-3` opens extra
// space before EmptyTitle beyond Empty's own tight `gap-1`, which otherwise
// only suits the Title/Description pairing.
function EmptyIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-icon"
      className={cn("mb-3 text-muted-foreground [&>svg]:size-32", className)}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="empty-title" className={cn("text-sm font-medium", className)} {...props} />
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p data-slot="empty-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
}

// `mt-3` mirrors EmptyIcon's `mb-3` - opens space after the tightly-packed
// title/description pair before the action(s) below.
function EmptyAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-action" className={cn("mt-3 flex items-center gap-2", className)} {...props} />
}

export { Empty, EmptyIcon, EmptyTitle, EmptyDescription, EmptyAction }
