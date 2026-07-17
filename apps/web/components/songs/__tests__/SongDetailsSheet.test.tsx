import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SongDetailsSheet } from "@/components/SongDetailsSheet"
import { createMockSong } from "../../test/fixtures"
import { render, screen } from "../../test/render"

vi.mock("@/components/SongDetailInfo", () => ({
  SongDetailInfo: () => <div data-testid="mock-song-detail-info" />,
}))

describe("SongDetailsSheet", () => {
  it("renders the song title and artist when open", () => {
    const song = createMockSong({ title: "Amazing Grace", artist: "Traditional" })

    render(<SongDetailsSheet song={song} albumArtUrl={undefined} open onOpenChange={vi.fn()} />)

    expect(screen.getByText("Amazing Grace")).toBeInTheDocument()
    expect(screen.getByText("Traditional")).toBeInTheDocument()
    expect(screen.getByTestId("mock-song-detail-info")).toBeInTheDocument()
  })

  it("falls back to 'Unknown artist' when artist is null", () => {
    const song = createMockSong({ artist: null })

    render(<SongDetailsSheet song={song} albumArtUrl={undefined} open onOpenChange={vi.fn()} />)

    expect(screen.getByText("Unknown artist")).toBeInTheDocument()
  })

  it("renders album art when albumArtUrl is provided", () => {
    const song = createMockSong({ title: "Amazing Grace" })

    render(
      <SongDetailsSheet song={song} albumArtUrl="https://example.com/art.png" open onOpenChange={vi.fn()} />
    )

    const image = screen.getByRole("img", { name: "Amazing Grace album art" })
    expect(image).toBeInTheDocument()
  })

  it("renders a fallback icon when albumArtUrl is undefined", () => {
    const song = createMockSong({ title: "Amazing Grace" })

    render(<SongDetailsSheet song={song} albumArtUrl={undefined} open onOpenChange={vi.fn()} />)

    expect(screen.queryByRole("img", { name: "Amazing Grace album art" })).not.toBeInTheDocument()
  })

  it("calls onOpenChange(false) when the close button is clicked", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const song = createMockSong()

    render(<SongDetailsSheet song={song} albumArtUrl={undefined} open onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole("button", { name: "Close" }))

    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
  })

  it("does not render sheet content when closed", () => {
    const song = createMockSong()

    render(<SongDetailsSheet song={song} albumArtUrl={undefined} open={false} onOpenChange={vi.fn()} />)

    expect(screen.queryByText("Song details")).not.toBeInTheDocument()
  })
})
