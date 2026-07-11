import { relations } from "drizzle-orm"
import { date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./schema.js"

export const invitation = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  role: text("role").notNull().default("user"),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const invitationRelations = relations(invitation, ({ one }) => ({
  invitedByUser: one(user, {
    fields: [invitation.invitedBy],
    references: [user.id],
  }),
}))

export const song = pgTable(
  "songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    artist: text("artist"),
    musicalKey: text("musical_key"),
    tempo: integer("tempo"),
    album: text("album"),
    releaseDate: date("release_date"),
    storageKey: text("storage_key").notNull(),
    albumArtStorageKey: text("album_art_storage_key"),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("song_uploaded_by_idx").on(table.uploadedBy)]
)

export const songRelations = relations(song, ({ one }) => ({
  uploader: one(user, {
    fields: [song.uploadedBy],
    references: [user.id],
  }),
}))
