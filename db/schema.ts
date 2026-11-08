import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  owner: text("owner").primaryKey(),
  revision: integer("revision").notNull().default(0),
  lastAction: text("last_action"),
});
export const records = sqliteTable(
  "records",
  {
    owner: text("owner").notNull(),
    kind: text("kind").notNull(),
    id: text("id").notNull(),
    value: text("value").notNull(),
  },
  (r) => [primaryKey({ columns: [r.owner, r.kind, r.id] })],
);
