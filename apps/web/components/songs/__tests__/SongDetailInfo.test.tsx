import { format } from "date-fns"
import { describe, expect, it } from "vitest"
import { SongDetailInfo } from "@/components/SongDetailInfo"
import { formatFileSize } from "@/utils/format-file-size"
import { createMockSong } from "../../test/fixtures"
import { render, screen } from "../../test/render"

describe("SongDetailInfo", () => {
  it("renders all fields when every optional value is present", () => {
    const song = createMockSong({
      artist: "Traditional",
      album: "Hymnal",
      musicalKey: "G",
      tempo: 72,
      releaseDate: "2020-05-01T00:00:00.000Z",
      originalFileName: "amazing-grace.mp3",
      fileSizeBytes: 2048,
      uploader: { id: "user-1", name: "Admin" },
      createdAt: "2026-01-01T00:00:00.000Z",
    })

    render(<SongDetailInfo song={song} />)

    expect(screen.getByText("Artist")).toBeInTheDocument()
    expect(screen.getByText("Traditional")).toBeInTheDocument()
    expect(screen.getByText("Album")).toBeInTheDocument()
    expect(screen.getByText("Hymnal")).toBeInTheDocument()
    expect(screen.getByText("Key")).toBeInTheDocument()
    expect(screen.getByText("G")).toBeInTheDocument()
    expect(screen.getByText("Tempo")).toBeInTheDocument()
    expect(screen.getByText("72 BPM")).toBeInTheDocument()
    expect(screen.getByText("Release date")).toBeInTheDocument()
    expect(screen.getByText(format(new Date("2020-05-01T00:00:00.000Z"), "PP"))).toBeInTheDocument()
    expect(screen.getByText("File")).toBeInTheDocument()
    expect(screen.getByText("amazing-grace.mp3")).toBeInTheDocument()
    expect(screen.getByText("File size")).toBeInTheDocument()
    expect(screen.getByText(formatFileSize(2048))).toBeInTheDocument()
    expect(screen.getByText("Uploaded by")).toBeInTheDocument()
    expect(screen.getByText("Admin")).toBeInTheDocument()
    expect(screen.getByText("Uploaded")).toBeInTheDocument()
    expect(screen.getByText(format(new Date("2026-01-01T00:00:00.000Z"), "PP"))).toBeInTheDocument()
  })

  it("renders fallback placeholders when optional values are absent", () => {
    const song = createMockSong({
      artist: null,
      album: null,
      musicalKey: null,
      tempo: null,
      releaseDate: null,
    })

    render(<SongDetailInfo song={song} />)

    expect(screen.getByText("Artist")).toBeInTheDocument()
    expect(screen.getByText("Unknown")).toBeInTheDocument()

    const dashes = screen.getAllByText("—")
    // Album, Key, Tempo, Release date all fall back to "—"
    expect(dashes).toHaveLength(4)
  })
})
