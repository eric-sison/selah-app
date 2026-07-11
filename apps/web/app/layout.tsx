import { type PropsWithChildren } from "react"
import { Geist_Mono, Inter } from "next/font/google"
import { QueryProvider } from "@/components/QueryProvider"
import { ThemeProvider } from "@/components/ThemeProvider"
import { cn } from "@workspace/ui/lib/utils"
import { Toaster } from "@workspace/ui/components/Sonner"
import "@workspace/ui/globals.css"
import { TooltipProvider } from "@workspace/ui/components/Tooltip"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({ children }: Readonly<PropsWithChildren>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans antialiased", fontMono.variable, inter.variable)}
    >
      <body className="h-dvh w-screen">
        <Toaster />
        <QueryProvider>
          <ThemeProvider defaultTheme="dark">
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
