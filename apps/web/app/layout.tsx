import { type PropsWithChildren } from "react"
import { Geist_Mono, Inter } from "next/font/google"
import { FacebookOAuthFragmentCleanup } from "@/components/FacebookOAuthFragmentCleanup"
import { QueryProvider } from "@/components/QueryProvider"
import { ThemeProvider } from "@/components/ThemeProvider"
import { cn } from "@workspace/ui/lib/utils"
import "@workspace/ui/globals.css"

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
        <QueryProvider>
          <ThemeProvider>
            <FacebookOAuthFragmentCleanup />
            {children}
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
