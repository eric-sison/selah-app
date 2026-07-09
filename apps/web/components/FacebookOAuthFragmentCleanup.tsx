"use client"

import type { FunctionComponent } from "react"
import { useEffect } from "react"

// Facebook's OAuth redirect appends "#_=_" to the callback URL regardless of
// app type - a legacy artifact from their old Canvas app SDK. It carries no
// data, so it's safe to just strip it once the page has landed.
export const FacebookOAuthFragmentCleanup: FunctionComponent = () => {
  useEffect(() => {
    if (window.location.hash === "#_=_") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      )
    }
  }, [])

  return null
}
