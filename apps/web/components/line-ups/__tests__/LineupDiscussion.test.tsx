import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LineupDiscussion } from "@/components/line-ups/LineupDiscussion"
import { apiClient } from "@/lib/api-client"
import { createMockSession } from "../../../test/fixtures"
import { renderWithProviders as render, screen, waitFor } from "../../../test/render"

vi.mock("@/lib/api-client", () => ({
  apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))

vi.mock("@workspace/ui/components/Sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const { toast } = await import("@workspace/ui/components/Sonner")

afterEach(() => {
  vi.clearAllMocks()
})

type Reaction = { emoji: "🙏" | "❤️" | "🔥" | "👏" | "😂"; count: number; reactedByMe: boolean }
interface MockReply {
  id: string
  body: string
  author: { id: string; name: string; image: string | null }
  createdAt: string
  reactions: Reaction[]
}
interface MockComment extends MockReply {
  replies: MockReply[]
}

function createMockReply(overrides: Partial<MockReply> = {}): MockReply {
  return {
    id: "reply-1",
    body: "Agreed!",
    author: { id: "user-2", name: "Casey Reyes", image: null },
    createdAt: "2026-01-01T00:00:00.000Z",
    reactions: [],
    ...overrides,
  }
}

function createMockComment(overrides: Partial<MockComment> = {}): MockComment {
  return {
    id: "comment-1",
    body: "Great set list!",
    author: { id: "user-1", name: "Ben Ortega", image: null },
    createdAt: "2026-01-01T00:00:00.000Z",
    reactions: [],
    replies: [],
    ...overrides,
  }
}

function mockComments(comments: MockComment[]) {
  vi.mocked(apiClient.GET).mockImplementation((path: string) => {
    if (path === "/api/lineups/{id}/comments") {
      return Promise.resolve({ data: comments, error: undefined }) as never
    }
    throw new Error(`Unexpected path: ${path}`)
  })
}

describe("LineupDiscussion", () => {
  it("shows a loading skeleton while comments are pending", () => {
    vi.mocked(apiClient.GET).mockReturnValue(new Promise(() => {}) as never)

    const { container } = render(<LineupDiscussion lineupId="lineup-1" />, {
      session: createMockSession(),
    })

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("shows an error message when comments fail to load", async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)

    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    expect(await screen.findByText("Failed to load comments.")).toBeInTheDocument()
  })

  it("shows no placeholder text when there are no comments, just the composer", async () => {
    mockComments([])
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    expect(await screen.findByPlaceholderText("Write a comment...")).toBeInTheDocument()
    expect(screen.getByText("Discussions")).toBeInTheDocument()
  })

  it("styles a reaction pill differently depending on whether you reacted with it", async () => {
    mockComments([
      createMockComment({
        reactions: [
          { emoji: "🙏", count: 2, reactedByMe: true },
          { emoji: "❤️", count: 1, reactedByMe: false },
        ],
      }),
    ])
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    const reactedPill = await screen.findByRole("button", { name: /🙏/ })
    const notReactedPill = screen.getByRole("button", { name: /❤️/ })

    expect(reactedPill.className).toContain("bg-primary/10")
    expect(notReactedPill.className).toContain("bg-muted")
  })

  it("renders a comment with its reply nested underneath, and the total count", async () => {
    mockComments([createMockComment({ replies: [createMockReply()] })])
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    expect(await screen.findByText("Great set list!")).toBeInTheDocument()
    expect(screen.getByText("Ben Ortega")).toBeInTheDocument()
    expect(screen.getByText("Agreed!")).toBeInTheDocument()
    expect(screen.getByText("Casey Reyes")).toBeInTheDocument()
    // 1 top-level comment + 1 reply
    expect(screen.getByText("2")).toBeInTheDocument()
  })

  it("toggles the collapsible section open state when the trigger is clicked", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    await screen.findByText("Great set list!")
    await user.click(screen.getByText("Discussions"))
  })

  it("posts a new top-level comment and clears the composer", async () => {
    const user = userEvent.setup()
    mockComments([])
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    const input = await screen.findByPlaceholderText("Write a comment...")
    await user.type(input, "Nice job everyone")
    await user.click(screen.getByRole("button", { name: "Post" }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/lineups/{id}/comments", {
        params: { path: { id: "lineup-1" } },
        body: { body: "Nice job everyone", parentCommentId: undefined },
      })
    })
    await waitFor(() => {
      expect(input).toHaveValue("")
    })
  })

  it("keeps the submit row hidden for whitespace-only input", async () => {
    const user = userEvent.setup()
    mockComments([])
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    const input = await screen.findByPlaceholderText("Write a comment...")
    await user.type(input, "   ")

    expect(screen.queryByRole("button", { name: "Post" })).not.toBeInTheDocument()
  })

  it("shows an error toast when posting a comment fails", async () => {
    const user = userEvent.setup()
    mockComments([])
    vi.mocked(apiClient.POST).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    const input = await screen.findByPlaceholderText("Write a comment...")
    await user.type(input, "Nice job everyone")
    await user.click(screen.getByRole("button", { name: "Post" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to post comment.", {
        position: "top-center",
      })
    })
  })

  it("opens a reply composer, posts the reply, and closes the composer again", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    vi.mocked(apiClient.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    await screen.findByText("Great set list!")
    await user.click(screen.getByText("Reply"))

    const replyInput = await screen.findByPlaceholderText("Reply to Ben Ortega...")
    await user.type(replyInput, "Me too!")
    await user.click(screen.getByRole("button", { name: "Post" }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/lineups/{id}/comments", {
        params: { path: { id: "lineup-1" } },
        body: { body: "Me too!", parentCommentId: "comment-1" },
      })
    })
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Reply to Ben Ortega...")).not.toBeInTheDocument()
    })
  })

  it("toggles the reply composer closed when Reply is clicked again", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    await screen.findByText("Great set list!")
    await user.click(screen.getByText("Reply"))
    expect(await screen.findByPlaceholderText("Reply to Ben Ortega...")).toBeInTheDocument()

    await user.click(screen.getByText("Reply"))
    expect(screen.queryByPlaceholderText("Reply to Ben Ortega...")).not.toBeInTheDocument()
  })

  it("cancels a reply without posting", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    await screen.findByText("Great set list!")
    await user.click(screen.getByText("Reply"))
    const replyInput = await screen.findByPlaceholderText("Reply to Ben Ortega...")
    await user.type(replyInput, "Never mind")

    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByPlaceholderText("Reply to Ben Ortega...")).not.toBeInTheDocument()
    expect(apiClient.POST).not.toHaveBeenCalled()
  })

  it("reacts to a top-level comment via the emoji picker", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    vi.mocked(apiClient.POST).mockResolvedValue({ data: [], error: undefined } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    await screen.findByText("Great set list!")
    await user.click(screen.getByRole("button", { name: "Add reaction" }))
    await user.click(screen.getByText("🙏"))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/lineups/{id}/comments/{commentId}/reactions", {
        params: { path: { id: "lineup-1", commentId: "comment-1" } },
        body: { emoji: "🙏" },
      })
    })
  })

  it("disables the reaction picker and pills while a reaction is in flight", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment({ reactions: [{ emoji: "🙏", count: 1, reactedByMe: true }] })])
    let resolvePost!: (value: unknown) => void
    vi.mocked(apiClient.POST).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }) as never
    )
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    await screen.findByText("Great set list!")
    await user.click(screen.getByRole("button", { name: /🙏/ }))

    expect(screen.getByRole("button", { name: /🙏/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add reaction" })).toBeDisabled()

    resolvePost({ data: [], error: undefined })
  })

  it("reacts to a reply, and re-toggles an existing reaction pill", async () => {
    const user = userEvent.setup()
    mockComments([
      createMockComment({
        replies: [createMockReply({ reactions: [{ emoji: "🔥", count: 1, reactedByMe: true }] })],
      }),
    ])
    vi.mocked(apiClient.POST).mockResolvedValue({ data: [], error: undefined } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    await screen.findByText("Agreed!")
    await user.click(screen.getByRole("button", { name: /🔥/ }))

    await waitFor(() => {
      expect(apiClient.POST).toHaveBeenCalledWith("/api/lineups/{id}/comments/{commentId}/reactions", {
        params: { path: { id: "lineup-1", commentId: "reply-1" } },
        body: { emoji: "🔥" },
      })
    })
  })

  it("shows an error toast when reacting fails", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    vi.mocked(apiClient.POST).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, { session: createMockSession() })

    await screen.findByText("Great set list!")
    await user.click(screen.getByRole("button", { name: "Add reaction" }))
    await user.click(screen.getByText("🙏"))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to react.", {
        position: "top-center",
      })
    })
  })

  it("hides the '...' menu on a comment authored by someone else", async () => {
    mockComments([createMockComment()])
    render(<LineupDiscussion lineupId="lineup-1" />, {
      session: createMockSession({ id: "someone-else" }),
    })

    await screen.findByText("Great set list!")
    expect(screen.queryByRole("button", { name: "Comment actions" })).not.toBeInTheDocument()
  })

  it("hides the '...' menu entirely when there's no signed-in user", async () => {
    mockComments([createMockComment()])
    render(<LineupDiscussion lineupId="lineup-1" />)

    await screen.findByText("Great set list!")
    expect(screen.queryByRole("button", { name: "Comment actions" })).not.toBeInTheDocument()
  })

  it("edits your own comment", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: {}, error: undefined } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, {
      session: createMockSession({ id: "user-1" }),
    })

    await screen.findByText("Great set list!")
    await user.click(screen.getByRole("button", { name: "Comment actions" }))
    await user.click(screen.getByText("Edit"))

    const editInput = await screen.findByDisplayValue("Great set list!")
    await user.clear(editInput)
    await user.type(editInput, "Edited body")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(apiClient.PATCH).toHaveBeenCalledWith("/api/lineups/{id}/comments/{commentId}", {
        params: { path: { id: "lineup-1", commentId: "comment-1" } },
        body: { body: "Edited body" },
      })
    })
  })

  it("cancels editing a comment without saving", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    render(<LineupDiscussion lineupId="lineup-1" />, {
      session: createMockSession({ id: "user-1" }),
    })

    await screen.findByText("Great set list!")
    await user.click(screen.getByRole("button", { name: "Comment actions" }))
    await user.click(screen.getByText("Edit"))

    const editInput = await screen.findByDisplayValue("Great set list!")
    await user.clear(editInput)
    await user.type(editInput, "Something else")
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(await screen.findByText("Great set list!")).toBeInTheDocument()
    expect(apiClient.PATCH).not.toHaveBeenCalled()
  })

  it("shows an error toast when editing a comment fails", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    vi.mocked(apiClient.PATCH).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, {
      session: createMockSession({ id: "user-1" }),
    })

    await screen.findByText("Great set list!")
    await user.click(screen.getByRole("button", { name: "Comment actions" }))
    await user.click(screen.getByText("Edit"))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to update comment.", {
        position: "top-center",
      })
    })
  })

  it("disables Save/Cancel on the comment being edited while the update is in flight", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment({ replies: [createMockReply()] })])
    let resolvePatch!: (value: unknown) => void
    vi.mocked(apiClient.PATCH).mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve
      }) as never
    )
    render(<LineupDiscussion lineupId="lineup-1" />, {
      session: createMockSession({ id: "user-1" }),
    })

    await screen.findByText("Great set list!")
    await user.click(screen.getByRole("button", { name: "Comment actions" }))
    await user.click(screen.getByText("Edit"))
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    resolvePatch({ data: {}, error: undefined })
  })

  it("edits your own reply", async () => {
    const user = userEvent.setup()
    mockComments([
      createMockComment({
        author: { id: "someone-else", name: "Ben Ortega", image: null },
        replies: [createMockReply({ author: { id: "user-1", name: "Casey Reyes", image: null } })],
      }),
    ])
    vi.mocked(apiClient.PATCH).mockResolvedValue({ data: {}, error: undefined } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, {
      session: createMockSession({ id: "user-1" }),
    })

    await screen.findByText("Agreed!")
    await user.click(screen.getByRole("button", { name: "Comment actions" }))
    await user.click(screen.getByText("Edit"))
    const editInput = await screen.findByDisplayValue("Agreed!")
    await user.clear(editInput)
    await user.type(editInput, "Edited reply")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(apiClient.PATCH).toHaveBeenCalledWith("/api/lineups/{id}/comments/{commentId}", {
        params: { path: { id: "lineup-1", commentId: "reply-1" } },
        body: { body: "Edited reply" },
      })
    })
  })

  it("deletes your own comment", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: {}, error: undefined } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, {
      session: createMockSession({ id: "user-1" }),
    })

    await screen.findByText("Great set list!")
    await user.click(screen.getByRole("button", { name: "Comment actions" }))
    await user.click(screen.getByText("Delete"))

    await waitFor(() => {
      expect(apiClient.DELETE).toHaveBeenCalledWith("/api/lineups/{id}/comments/{commentId}", {
        params: { path: { id: "lineup-1", commentId: "comment-1" } },
      })
    })
  })

  it("deletes your own reply", async () => {
    const user = userEvent.setup()
    mockComments([
      createMockComment({
        author: { id: "someone-else", name: "Ben Ortega", image: null },
        replies: [createMockReply({ author: { id: "user-1", name: "Casey Reyes", image: null } })],
      }),
    ])
    vi.mocked(apiClient.DELETE).mockResolvedValue({ data: {}, error: undefined } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, {
      session: createMockSession({ id: "user-1" }),
    })

    await screen.findByText("Agreed!")
    await user.click(screen.getByRole("button", { name: "Comment actions" }))
    await user.click(screen.getByText("Delete"))

    await waitFor(() => {
      expect(apiClient.DELETE).toHaveBeenCalledWith("/api/lineups/{id}/comments/{commentId}", {
        params: { path: { id: "lineup-1", commentId: "reply-1" } },
      })
    })
  })

  it("shows an error toast when deleting a comment fails", async () => {
    const user = userEvent.setup()
    mockComments([createMockComment()])
    vi.mocked(apiClient.DELETE).mockResolvedValue({
      data: undefined,
      error: { status: 500, message: "Server error" },
    } as never)
    render(<LineupDiscussion lineupId="lineup-1" />, {
      session: createMockSession({ id: "user-1" }),
    })

    await screen.findByText("Great set list!")
    await user.click(screen.getByRole("button", { name: "Comment actions" }))
    await user.click(screen.getByText("Delete"))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to delete comment.", {
        position: "top-center",
      })
    })
  })
})
