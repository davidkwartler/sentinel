// Backfills Fingerprint.userId and DetectionEvent.userId for rows written
// before those columns existed, deriving the owner from the session each row
// was recorded against.
//
// Run once, after `npx prisma db push` has added the columns. Safe to re-run:
// it only touches rows where userId is still null and the session is still
// present. Rows whose session was already deleted cannot be attributed to
// anyone and are reported rather than guessed at.
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

  await client.query("COMMIT")
  console.log(
    `backfilled ${fingerprints.rowCount} fingerprints, ${events.rowCount} detection events`,
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
