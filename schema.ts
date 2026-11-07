import {
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

/** Mosaika OAuth and single-account Instagram integration. */
export const mosaikaOAuthStates = mysqlTable("mosaika_oauth_states", {
  stateHash: varchar("stateHash", { length: 64 }).primaryKey(),
  returnUri: text("returnUri").notNull(),
  codeChallenge: varchar("codeChallenge", { length: 43 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export const mosaikaOAuthTickets = mysqlTable("mosaika_oauth_tickets", {
  ticketHash: varchar("ticketHash", { length: 64 }).primaryKey(),
  codeChallenge: varchar("codeChallenge", { length: 43 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const mosaikaSessions = mysqlTable("mosaika_sessions", {
  tokenHash: varchar("tokenHash", { length: 64 }).primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const mosaikaInstagramConnection = mysqlTable(
  "mosaika_instagram_connection",
  {
    id: int("id").autoincrement().primaryKey(),
    instagramId: varchar("instagramId", { length: 80 }).notNull().unique(),
    clientBusinessId: varchar("clientBusinessId", { length: 80 }),
    configId: varchar("configId", { length: 100 }),
    username: varchar("username", { length: 255 }).notNull(),
    profilePictureUrl: text("profilePictureUrl"),
    followersCount: int("followersCount"),
    accessToken: longtext("accessToken").notNull(),
    connectionKey: varchar("connectionKey", { length: 64 }),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
);

export const mosaikaPosts = mysqlTable("mosaika_posts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  kind: varchar("kind", { length: 32 }).notNull(),
  caption: text("caption"),
  mediaKeys: text("mediaKeys").notNull(),
  status: varchar("status", { length: 24 }).default("draft").notNull(),
  remoteId: varchar("remoteId", { length: 100 }),
  connectionKey: varchar("connectionKey", { length: 64 }),
  scheduledAt: timestamp("scheduledAt"),
  heartbeatUid: varchar("heartbeatUid", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  publishedAt: timestamp("publishedAt"),
});
