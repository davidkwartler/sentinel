// Backfills the columns added when detection evidence stopped being scoped to
// a session: Fingerprint.userId and DetectionEvent.userId, derived from the
// session each row was recorded against, and the denormalized device
// components on DetectionEvent, copied from the fingerprints the event refers
// to.
//
// Run once, after `npx prisma db push` has added the columns. Safe to re-run:
// every statement is guarded on the target still being null and the source row
// still being present. Rows whose session was already deleted cannot be
// attributed to anyone and are reported rather than guessed at.
//
//   node scripts/backfill-user-ownership.mjs
//
// Reads DATABASE_URL_UNPOOLED (falling back to DATABASE_URL) from .env.local.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import pg from "pg"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

const env = Object.fromEntries(
  readFileSync(join(repoRoot, ".env.local"), "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=")
      return [
        line.slice(0, i).trim(),
        line
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ]
    }),
)

const connectionString = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
if (!connectionString) {
  console.error("No DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local")
  process.exit(1)
}

const client = new pg.Client({ connectionString })
await client.connect()

const counts = async () =>
  (
    await client.query(`select
      (select count(*)::int from "Fingerprint" where "userId" is null) fp_null,
      (select count(*)::int from "DetectionEvent" where "userId" is null) ev_null,
      (select count(*)::int from "DetectionEvent" where "originalOs" is null and "newOs" is null) ev_components_null,
      (select count(*)::int from "Fingerprint" where "userId" is null and "sessionId" is null) fp_orphan,
      (select count(*)::int from "DetectionEvent" where "userId" is null and "sessionId" is null) ev_orphan`)
  ).rows[0]

console.log("before:", await counts())

try {
  await client.query("BEGIN")

  const fingerprints = await client.query(
    `update "Fingerprint" f set "userId" = s."userId"
       from "Session" s
      where s.id = f."sessionId" and f."userId" is null`,
  )
  const events = await client.query(
    `update "DetectionEvent" d set "userId" = s."userId"
       from "Session" s
      where s.id = d."sessionId" and d."userId" is null`,
  )

  // The components an event renders and re-analyzes against. New events get
  // these written at creation time; ones that predate the columns have to read
  // them back off the fingerprints while those rows are still reachable, which
  // is exactly what stops being true once a session is deleted.
  const original = await client.query(
    `update "DetectionEvent" d set
       "originalOs" = o.os, "originalBrowser" = o.browser,
       "originalScreenRes" = o."screenRes", "originalTimezone" = o.timezone,
       "originalUserAgent" = o."userAgent"
     from "Fingerprint" o
     where o."sessionId" = d."sessionId" and o."isOriginal" = true
       and d."originalOs" is null`,
  )
  const latest = await client.query(
    `update "DetectionEvent" d set
       "newOs" = n.os, "newBrowser" = n.browser,
       "newScreenRes" = n."screenRes", "newTimezone" = n.timezone,
       "newUserAgent" = n."userAgent"
     from "Fingerprint" n
     where n."sessionId" = d."sessionId" and n."visitorId" = d."newVisitorId"
       and d."newOs" is null`,
  )

  await client.query("COMMIT")
  console.log(
    `backfilled ${fingerprints.rowCount} fingerprints, ${events.rowCount} detection events, ` +
      `${original.rowCount} original + ${latest.rowCount} new component sets`,
  )
} catch (err) {
  await client.query("ROLLBACK")
  console.error("ROLLED BACK:", err.message)
  process.exitCode = 1
}

const after = await counts()
console.log("after: ", after)

// Rows that predate the columns AND lost their session already have no path
// back to an owner. They stay visible in the database but will not appear in
// any per-user view; nothing here can honestly attribute them.
if (after.fp_orphan > 0 || after.ev_orphan > 0) {
  console.warn(
    `\n${after.fp_orphan} fingerprints and ${after.ev_orphan} detection events have no userId and no session — not attributable, left as-is.`,
  )
}

await client.end()
