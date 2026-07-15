import { relations, sql } from "drizzle-orm"
import { date, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { users } from "./auth-schema.js"

export const invitation = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  role: text("role").notNull().default("user"),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const invitationRelations = relations(invitation, ({ one }) => ({
  invitedByUser: one(users, {
    fields: [invitation.invitedBy],
    references: [users.id],
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
    chordpro: text("chordpro"),
    storageKey: text("storage_key").notNull(),
    albumArtStorageKey: text("album_art_storage_key"),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("song_uploaded_by_idx").on(table.uploadedBy),
    // Trigram indexes back the spelling-tolerant search in listSongs() -
    // pg_trgm's `similarity()`/`%` need a GIN index over these ops to avoid
    // a sequential scan once the table grows.
    index("song_title_trgm_idx").using("gin", sql`${table.title} gin_trgm_ops`),
    index("song_artist_trgm_idx").using("gin", sql`${table.artist} gin_trgm_ops`),
  ]
)

export const songRelations = relations(song, ({ one }) => ({
  uploader: one(users, {
    fields: [song.uploadedBy],
    references: [users.id],
  }),
}))

// The fixed set of instrument/vocal roles a team member can be assigned -
// deliberately a closed enum rather than free text, since these drive
// role-coverage checks (e.g. "does this team have a drummer?") that would
// silently break against typos or inconsistent casing.
export const teamRole = pgEnum("team_role", [
  "bass",
  "drums",
  "singer",
  "electric_guitar",
  "acoustic_guitar",
  "keyboard",
])

export const team = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    // Nullable and independent of teamMember on purpose - a team leader
    // doesn't have to also be a rostered member with an instrument role
    // (e.g. a pastor overseeing the team). `set null` (not cascade) on
    // delete, since losing the leader's user account should leave the team
    // itself intact, just leaderless.
    teamLeaderId: text("team_leader_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("team_teamLeaderId_idx").on(table.teamLeaderId)]
)

export const teamRelations = relations(team, ({ one, many }) => ({
  members: many(teamMember),
  leader: one(users, {
    fields: [team.teamLeaderId],
    references: [users.id],
  }),
}))

// Membership is tracked separately from role assignment (teamMemberRole
// below) - a musician can be added to a team before any role is decided,
// which the line ups UI surfaces as a "no role assigned yet" state.
export const teamMember = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("team_member_teamId_idx").on(table.teamId),
    index("team_member_userId_idx").on(table.userId),
    // A given user can only be added to the same team once - re-adding them
    // is a no-op, not a duplicate row.
    unique("team_member_team_user_unique").on(table.teamId, table.userId),
  ]
)

export const teamMemberRelations = relations(teamMember, ({ one, many }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(users, {
    fields: [teamMember.userId],
    references: [users.id],
  }),
  roles: many(teamMemberRole),
}))

// A member can hold more than one role on the same team (e.g. plays
// acoustic guitar and sings) - one row per (member, role) pair rather than
// a single role column.
export const teamMemberRole = pgTable(
  "team_member_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamMemberId: uuid("team_member_id")
      .notNull()
      .references(() => teamMember.id, { onDelete: "cascade" }),
    role: teamRole("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("team_member_role_teamMemberId_idx").on(table.teamMemberId),
    unique("team_member_role_member_role_unique").on(table.teamMemberId, table.role),
  ]
)

export const teamMemberRoleRelations = relations(teamMemberRole, ({ one }) => ({
  teamMember: one(teamMember, {
    fields: [teamMemberRole.teamMemberId],
    references: [teamMember.id],
  }),
}))
