import { relations, sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
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

export const lineupStatus = pgEnum("lineup_status", ["pending", "approved"])

export const lineup = pgTable(
  "lineups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: lineupStatus("status").notNull().default("pending"),
    // Deliberately no `onDelete` (defaults to NO ACTION/restrict), unlike
    // teamMember's cascade - a team is a reusable roster referenced by many
    // lineups over time, so deleting it shouldn't silently wipe every past
    // service that used it. The team must be reassigned or those lineups
    // removed explicitly first.
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id),
    seriesName: text("series_name").notNull(),
    topic: text("topic").notNull(),
    // e.g. "John 15:5-8" - kept separate from the passage text itself so the
    // UI can render the reference and the quoted verse differently.
    wordReference: text("word_reference").notNull(),
    wordText: text("word_text").notNull(),
    direction: text("direction"),
    // Nullable and, like team.teamLeaderId, independent at the DB level -
    // the business rule that this must be one of the lineup's own singers/
    // musicians (lineupMember below) is enforced in the service layer, not
    // a DB constraint, mirroring teamRole's enum-not-constraint precedent.
    devoLeaderId: text("devo_leader_id").references(() => users.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("lineup_team_id_idx").on(table.teamId),
    index("lineup_devo_leader_id_idx").on(table.devoLeaderId),
  ]
)

// Ordered many-to-many between lineups and songs - `position` (rather than
// relying on row/created-at order) survives songs being removed and
// re-added without reshuffling the rest of the set list.
export const lineupSong = pgTable(
  "lineup_songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineupId: uuid("lineup_id")
      .notNull()
      .references(() => lineup.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => song.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("lineup_song_lineup_id_idx").on(table.lineupId),
    index("lineup_song_song_id_idx").on(table.songId),
    unique("lineup_song_lineup_song_unique").on(table.lineupId, table.songId),
    unique("lineup_song_lineup_position_unique").on(table.lineupId, table.position),
  ]
)

export const lineupSongRelations = relations(lineupSong, ({ one }) => ({
  lineup: one(lineup, {
    fields: [lineupSong.lineupId],
    references: [lineup.id],
  }),
  song: one(song, {
    fields: [lineupSong.songId],
    references: [song.id],
  }),
}))

export const lineupMemberRole = pgEnum("lineup_member_role", ["singer", "musician"])

// A lineup's singers/musicians are tracked independently of team membership
// (see removeTeamMember's doc comment in services/teams.ts) - musicians
// pulled from the assigned team are the common case, but someone outside
// the team can be added directly, and a team member can hold both roles on
// the same lineup (one row per (lineup, user, role) pair, same shape as
// teamMemberRole).
export const lineupMember = pgTable(
  "lineup_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineupId: uuid("lineup_id")
      .notNull()
      .references(() => lineup.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: lineupMemberRole("role").notNull(),
    // Someone slated for this lineup (often pulled straight from the team
    // roster) can turn out to be unavailable - flipped to `false` rather
    // than deleting the row, so the original assignment stays visible
    // (e.g. struck through in the UI) instead of silently disappearing.
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("lineup_member_lineup_id_idx").on(table.lineupId),
    index("lineup_member_user_id_idx").on(table.userId),
    unique("lineup_member_lineup_user_role_unique").on(table.lineupId, table.userId, table.role),
  ]
)

export const lineupMemberRelations = relations(lineupMember, ({ one }) => ({
  lineup: one(lineup, {
    fields: [lineupMember.lineupId],
    references: [lineup.id],
  }),
  user: one(users, {
    fields: [lineupMember.userId],
    references: [users.id],
  }),
}))

// The closed set of calendar entry types the /schedules page groups by -
// "rehearsal" is reserved for a lineup's practice session (see
// scheduleLineupRole below); every other value is a service type a lineup's
// service slot can be. Deliberately a DB enum for the same reason as
// teamRole - these drive filtering/grouping on the schedules page that
// would silently break against typos.
export const scheduleType = pgEnum("schedule_type", [
  "sunday_service",
  "youth_service",
  "necrological_service",
  "rehearsal",
  "prayer_meeting_service",
  "victory_day",
  "other",
])

// Distinguishes which of a lineup's two calendar slots a schedule row is,
// when it's tied to one - a lineup has at most one "service" schedule and
// at most one "practice" schedule (enforced by the unique index below).
// Not derivable from `type` alone: a lineup's own service slot can be any
// non-rehearsal type, so this stays an explicit column rather than
// inferring the role from `type != 'rehearsal'` everywhere it's queried.
export const scheduleLineupRole = pgEnum("schedule_lineup_role", ["service", "practice"])

// General calendar entries for the /schedules page. Most rows come from a
// lineup's service date and practice date/time (see lineup above), but a
// schedule can also stand alone - e.g. a "Prayer Meeting Service" or
// "Victory Day" entry with no associated lineup - which is why `lineupId`
// is nullable rather than this table living as columns on `lineup` itself.
// Keeping schedule data here instead of duplicating date/time fields on
// `lineup` means the schedules page reads from one table regardless of
// whether an entry originated from a lineup.
export const schedule = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: scheduleType("type").notNull(),
    // The FK lives here (not on `lineup`) so deleting a lineup cascades to
    // remove the schedule slots it created, without forcing every schedule
    // row (including standalone ones) to belong to a lineup.
    lineupId: uuid("lineup_id").references(() => lineup.id, { onDelete: "cascade" }),
    lineupRole: scheduleLineupRole("lineup_role"),
    // Only meaningful for standalone entries (no lineup) - a lineup-linked
    // schedule's display title comes from the lineup's own topic/series
    // instead.
    title: text("title"),
    startAt: timestamp("start_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("schedule_lineup_id_idx").on(table.lineupId),
    index("schedule_start_at_idx").on(table.startAt),
    index("schedule_type_idx").on(table.type),
    // NULL lineupId values don't conflict with each other under standard
    // unique-constraint semantics, so this only actually constrains the
    // lineup-linked rows - at most one "service" and one "practice" row per
    // lineup - without blocking multiple standalone schedules.
    unique("schedule_lineup_role_unique").on(table.lineupId, table.lineupRole),
  ]
)

export const scheduleRelations = relations(schedule, ({ one }) => ({
  lineup: one(lineup, {
    fields: [schedule.lineupId],
    references: [lineup.id],
  }),
}))

// Defined last since it references lineupSong/lineupMember/schedule, which
// have to already be initialized (const declarations aren't hoisted the way
// function declarations are) by the time this callback runs.
export const lineupRelations = relations(lineup, ({ one, many }) => ({
  team: one(team, {
    fields: [lineup.teamId],
    references: [team.id],
  }),
  devoLeader: one(users, {
    fields: [lineup.devoLeaderId],
    references: [users.id],
  }),
  songs: many(lineupSong),
  members: many(lineupMember),
  schedules: many(schedule),
}))
