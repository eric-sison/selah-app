"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/Tabs"
import { Library, Link2, Mail, Music, Shield, User } from "lucide-react"
import { FunctionComponent } from "react"
import { useSession } from "@/components/SessionProvider"
import { LinkedAccounts } from "@/components/LinkedAccounts"
import { AdminInviteSection } from "@/components/settings/AdminInviteSection"
import { EmailForm } from "@/components/settings/EmailForm"
import { LibraryUsageSection } from "@/components/settings/LibraryUsageSection"
import { MusicianInstrumentsSection } from "@/components/settings/MusicianInstrumentsSection"
import { MyTeamsSection } from "@/components/settings/MyTeamsSection"
import { PasswordForm } from "@/components/settings/PasswordForm"
import { ProfileForm } from "@/components/settings/ProfileForm"
import { SessionsList } from "@/components/settings/SessionsList"

export const SettingsNav: FunctionComponent = () => {
  const session = useSession()
  const isAdmin = session?.user.role === "admin"

  return (
    <Tabs defaultValue="profile" orientation="vertical" className="items-start gap-8">
      <TabsList variant="line" className="w-56 shrink-0 flex-col items-stretch">
        <TabsTrigger value="profile" className="justify-start">
          <User /> Profile
        </TabsTrigger>
        <TabsTrigger value="security" className="justify-start">
          <Shield /> Account &amp; security
        </TabsTrigger>
        <TabsTrigger value="connected" className="justify-start">
          <Link2 /> Connected accounts
        </TabsTrigger>
        <TabsTrigger value="musician" className="justify-start">
          <Music /> Musician profile
        </TabsTrigger>
        <TabsTrigger value="library" className="justify-start">
          <Library /> Your library
        </TabsTrigger>
        {isAdmin && (
          <TabsTrigger value="invitations" className="justify-start">
            <Mail /> Invitations
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="profile" className="max-w-2xl">
        <ProfileForm />
      </TabsContent>

      <TabsContent value="security" className="max-w-2xl space-y-6">
        <EmailForm />
        <PasswordForm />
        <SessionsList />
      </TabsContent>

      <TabsContent value="connected" className="max-w-2xl">
        <LinkedAccounts />
      </TabsContent>

      <TabsContent value="musician" className="max-w-2xl space-y-6">
        <MusicianInstrumentsSection />
        <MyTeamsSection />
      </TabsContent>

      <TabsContent value="library" className="max-w-2xl">
        <LibraryUsageSection />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="invitations" className="max-w-2xl">
          <AdminInviteSection />
        </TabsContent>
      )}
    </Tabs>
  )
}
