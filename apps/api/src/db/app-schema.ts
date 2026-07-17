import { relations, sql } from "drizzle-orm"
import {
  type AnyPgColumn,
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

// The fixed set of instruments/vocal parts a musician can play - deliberately
// a closed enum rather than free text, since these drive coverage checks
// (e.g. "does this team have a drummer?") that would silently break against
// typos or inconsistent casing.
export const instrument = pgEnum("instrument", [
  "bass",
  "drums",
  "singer",
  "electric_guitar",
  "acoustic_guitar",
  "keyboard",
])

// A person's instruments are global to them, not scoped to a team - set once
// here and carried over everywhere they're referenced (a team roster, a
// lineup, etc.) instead of being re-assigned per team.
export const musician = pgTable(
  "musicians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instruments: instrument("instruments")
      .array()
      .notNull()
      .default(sql`'{}'::instrument[]`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("musician_userId_idx").on(table.userId),
    unique("musician_userId_unique").on(table.userId),
  ]
)

export const musicianRelations = relations(musician, ({ one }) => ({
  user: one(users, {
    fields: [musician.userId],
    references: [users.id],
  }),
}))

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

// Membership is just who's on the roster - a member's instruments live
// globally on the musicians table above, not per-team, so adding someone
// here doesn't involve deciding or copying any role.
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

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(users, {
    fields: [teamMember.userId],
    references: [users.id],
  }),
}))

// "draft" - still being put together, not yet ready for a pastor's review.
// "pending" - submitted, awaiting approval. "approved" - approved by a
// pastor (see requireAdmin-gated create/update and the pastor-only approve
// flow this status distinction exists for).
export const lineupStatus = pgEnum("lineup_status", ["draft", "pending", "approved"])

// The kind of service a lineup itself is for - a lineup's own type, not a
// generic calendar entry's, which is why this is a separate (smaller) enum
// from scheduleType below rather than reusing it: "rehearsal" isn't a kind
// of service a lineup can be, it's the lineup's supporting prep event (see
// rehearsalDate below). Kept in sync by hand with scheduleType's non-
// rehearsal values, the same tradeoff INSTRUMENTS documents for instrument.
export const lineupServiceType = pgEnum("lineup_service_type", [
  "sunday_service",
  "youth_service",
  "necrological_service",
  "prayer_meeting_service",
  "victory_day",
  "other",
])

export const lineup = pgTable(
  "lineups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: lineupStatus("status").notNull().default("draft"),
    serviceType: lineupServiceType("service_type").notNull(),
    serviceDate: timestamp("service_date").notNull(),
    // Nullable - a lineup can be created before its rehearsal is scheduled
    // (see the "draft, still confirming musicians" case this UI surfaces
    // elsewhere). Single column rather than its own table since a lineup
    // has at most one rehearsal today; revisit only if that stops holding.
    rehearsalDate: timestamp("rehearsal_date"),
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
    // UI can render the reference and the quoted verse differently. Nullable -
    // the create UI only collects the reference; the passage text can be
    // filled in later (e.g. from an edit flow) if it's ever needed.
    wordReference: text("word_reference").notNull(),
    wordText: text("word_text"),
    direction: text("direction"),
    // Nullable and, like team.teamLeaderId, independent at the DB level -
    // the business rule that this must be one of the lineup's own singers/
    // musicians (lineupMember below) is enforced in the service layer, not
    // a DB constraint, mirroring instrument's enum-not-constraint precedent.
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
    // Backs the spelling-tolerant series search in listLineups() - same
    // trigram approach as song.title/song.artist above.
    index("lineup_series_name_trgm_idx").using("gin", sql`${table.seriesName} gin_trgm_ops`),
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

// A lineup's singers/musicians are tracked independently of team membership
// (see removeTeamMember's doc comment in services/teams.ts) - musicians
// pulled from the assigned team are the common case, but someone outside
// the team can be added directly. Deliberately has no instruments of its
// own - a lineup member's instruments are just read, at request time, from
// their global musicians row (see getInstrumentsByUserIds in
// services/musicians.ts), independent of team membership entirely.
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
    // A given user can only be added to the same lineup's roster once now
    // that there's no per-role row to distinguish (mirrors teamMember's own
    // team_member_team_user_unique).
    unique("lineup_member_lineup_user_unique").on(table.lineupId, table.userId),
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
// instrument - these drive filtering/grouping on the schedules page that
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

// General calendar entries for the /schedules page. `lineup.serviceType`/
// `serviceDate`/`rehearsalDate` are the source of truth for a lineup-linked
// entry - the service layer (see syncLineupSchedules in services/lineups.ts)
// upserts this table's `type`/`startAt` to match whenever a lineup is
// created or updated, so the schedules page can still read from one table
// regardless of whether an entry originated from a lineup or stands alone
// (e.g. a "Prayer Meeting Service" or "Victory Day" entry with no lineup at
// all, which is why `lineupId` is nullable).
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

// Discussion happens on the lineup as a whole, not per-song - a set list is
// planned and adjusted together, so comments are scoped to `lineupId`
// rather than to an individual lineupSong row.
export const lineupComment = pgTable(
  "lineup_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineupId: uuid("lineup_id")
      .notNull()
      .references(() => lineup.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Self-referencing for replies - null for a top-level comment. The UI
    // only renders one level of nesting today, but that's a rendering
    // choice, not a DB constraint, so a reply-to-a-reply isn't rejected
    // here. `AnyPgColumn` (rather than inferring the type) is required by
    // Drizzle for a column that references its own table.
    parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => lineupComment.id, {
      onDelete: "cascade",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("lineup_comment_lineup_id_idx").on(table.lineupId),
    index("lineup_comment_parent_comment_id_idx").on(table.parentCommentId),
  ]
)

export const lineupCommentRelations = relations(lineupComment, ({ one, many }) => ({
  lineup: one(lineup, {
    fields: [lineupComment.lineupId],
    references: [lineup.id],
  }),
  author: one(users, {
    fields: [lineupComment.authorId],
    references: [users.id],
  }),
  // Self-referential in both directions, so each needs its own
  // `relationName` to disambiguate which side of the pair a query means.
  parent: one(lineupComment, {
    fields: [lineupComment.parentCommentId],
    references: [lineupComment.id],
    relationName: "lineupCommentReplies",
  }),
  replies: many(lineupComment, { relationName: "lineupCommentReplies" }),
  reactions: many(lineupCommentReaction),
}))

// The curated emoji set the discussion's reaction picker offers - a closed
// enum for the same reason as instrument/scheduleType, so a reaction can't
// silently become an arbitrary/spam string.
export const reactionEmoji = pgEnum("reaction_emoji", ["🙏", "❤️", "🔥", "👏", "😂"])

export const lineupCommentReaction = pgTable(
  "lineup_comment_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => lineupComment.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: reactionEmoji("emoji").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("lineup_comment_reaction_comment_id_idx").on(table.commentId),
    // A user can react to the same comment with several different emoji,
    // but toggles a given one on/off rather than stacking duplicates of it.
    unique("lineup_comment_reaction_comment_user_emoji_unique").on(
      table.commentId,
      table.userId,
      table.emoji
    ),
  ]
)

export const lineupCommentReactionRelations = relations(lineupCommentReaction, ({ one }) => ({
  comment: one(lineupComment, {
    fields: [lineupCommentReaction.commentId],
    references: [lineupComment.id],
  }),
  user: one(users, {
    fields: [lineupCommentReaction.userId],
    references: [users.id],
  }),
}))

// Defined last since it references lineupSong/lineupMember/schedule/
// lineupComment, which have to already be initialized (const declarations
// aren't hoisted the way function declarations are) by the time this
// callback runs.
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
  comments: many(lineupComment),
}))
