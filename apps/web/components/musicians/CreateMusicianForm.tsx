"use client"

import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import { Badge } from "@workspace/ui/components/Badge"
import { Button } from "@workspace/ui/components/Button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/Combobox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/Field"
import { InputGroupAddon } from "@workspace/ui/components/InputGroup"
import { SheetClose, SheetFooter } from "@workspace/ui/components/Sheet"
import { toast } from "@workspace/ui/components/Sonner"
import { UserRoundSearch } from "lucide-react"
import { FunctionComponent, useState } from "react"
import z from "zod"
import { apiClient } from "@/lib/api-client"
import { formatInstrument, INSTRUMENTS, type Instrument } from "@/utils/instruments"
import type { operations } from "@/types/api"

type User = operations["listUsers"]["responses"][200]["content"]["application/json"][number]

const UserComboboxItem: FunctionComponent<{ user: User }> = ({ user }) => (
  <ComboboxItem value={user}>
    <Avatar size="sm">
      <AvatarImage src={user.image ?? undefined} alt={user.name} />
      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
    </Avatar>
    <div className="flex min-w-0 flex-col">
      <span className="truncate">{user.name}</span>
      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
    </div>
  </ComboboxItem>
)

const CreateMusicianFormSchema = z.object({
  userId: z.string().min(1, { error: "Choose a user." }),
})

interface CreateMusicianFormProps {
  onSuccess?: () => void
}

export const CreateMusicianForm: FunctionComponent<CreateMusicianFormProps> = ({ onSuccess }) => {
  const queryClient = useQueryClient()

  const [userInputValue, setUserInputValue] = useState("")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [instruments, setInstruments] = useState<Instrument[]>([])

  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/users")
      if (error) throw new Error("Failed to load users.")
      return data
    },
  })

  const musicians = useQuery({
    queryKey: ["musicians"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/musicians")
      if (error) throw new Error("Failed to load musicians.")
      return data
    },
  })

  // Only offer users who don't already have a musician profile - creating
  // one here is how a new musician gets provisioned in the first place.
  const musicianUserIds = new Set((musicians.data ?? []).map((m) => m.user.id))
  const availableUsers = (users.data ?? []).filter((user) => !musicianUserIds.has(user.id))

  const toggleInstrument = (instrument: Instrument) => {
    setInstruments((prev) => (prev.includes(instrument) ? prev.filter((i) => i !== instrument) : [...prev, instrument]))
  }

  const createMusician = useMutation({
    mutationFn: async (values: z.infer<typeof CreateMusicianFormSchema>) => {
      const { data, error } = await apiClient.POST("/api/musicians", {
        body: { userId: values.userId, instruments },
      })
      if (error) throw new Error("Failed to create musician profile.")
      return data
    },
    onSuccess: () => {
      toast.success("Musician profile created.", { position: "top-center" })
      queryClient.invalidateQueries({ queryKey: ["musicians"] })
      createMusicianForm.reset()
      setSelectedUser(null)
      setUserInputValue("")
      setInstruments([])
      onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message, { position: "top-center" })
    },
  })

  const createMusicianForm = useForm({
    validators: {
      onSubmit: CreateMusicianFormSchema,
    },
    defaultValues: {
      userId: "",
    },
    onSubmit: async ({ value }) => {
      // mutateAsync rethrows on failure (its onError above already shows a
      // toast) and TanStack Form's handleSubmit rethrows again on top of
      // that - left uncaught, that becomes an unhandled rejection since the
      // form is submitted via `void handleSubmit()`.
      await createMusician.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <>
      <form
        id="create-musician-form"
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void createMusicianForm.handleSubmit()
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4"
      >
        <FieldGroup>
          <createMusicianForm.Field name="userId">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="musician-user">User</FieldLabel>
                  <Combobox
                    items={availableUsers}
                    inputValue={userInputValue}
                    onInputValueChange={setUserInputValue}
                    itemToStringLabel={(user: User) => user.name}
                    onValueChange={(user: User | null) => {
                      setSelectedUser(user)
                      field.handleChange(user?.id ?? "")
                      setUserInputValue(user?.name ?? "")
                    }}
                  >
                    <ComboboxInput
                      id="musician-user"
                      placeholder="Search users..."
                      showClear={!!selectedUser}
                      disabled={users.isLoading || musicians.isLoading}
                      onBlur={field.handleBlur}
                      aria-invalid={isInvalid}
                    >
                      <InputGroupAddon align="inline-start">
                        <UserRoundSearch />
                      </InputGroupAddon>
                    </ComboboxInput>
                    <ComboboxContent className="min-w-(--anchor-width) bg-popover">
                      <ComboboxEmpty>No users found.</ComboboxEmpty>
                      <ComboboxList>
                        {(user: User) => <UserComboboxItem key={user.id} user={user} />}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </createMusicianForm.Field>

          <Field>
            <FieldLabel>Instruments</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {INSTRUMENTS.map((instrument) => {
                const isSelected = instruments.includes(instrument)
                return (
                  <Badge
                    key={instrument}
                    variant={isSelected ? "default" : "outline"}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => toggleInstrument(instrument)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return
                      e.preventDefault()
                      toggleInstrument(instrument)
                    }}
                    className="cursor-pointer select-none"
                  >
                    {formatInstrument(instrument)}
                  </Badge>
                )
              })}
            </div>
          </Field>
        </FieldGroup>
      </form>
      <SheetFooter className="flex-row justify-end border-t bg-muted/50">
        <SheetClose render={<Button variant="outline" disabled={createMusician.isPending} />}>
          Cancel
        </SheetClose>
        <Button type="submit" form="create-musician-form" disabled={createMusician.isPending}>
          {createMusician.isPending ? "Creating..." : "Create musician"}
        </Button>
      </SheetFooter>
    </>
  )
}
