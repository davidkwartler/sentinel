---
phase: 01-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
  - next.config.ts
  - tailwind.config.ts
  - prisma/schema.prisma
  - lib/db.ts
  - .env.local
autonomous: true
requirements:
  - AUTH-03

must_haves:
  truths:
    - "Next.js 16 project exists and `npm run dev` starts without errors"
    - "Prisma schema has all four Auth.js-required tables (User, Account, Session, VerificationToken)"
    - "Auth.js Session table rows appear in Neon after a completed sign-in (verified in Plan 03)"
    - "Both DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct) are configured in schema.prisma"
  artifacts:
    - path: "package.json"
      provides: "next@16.x, next-auth@beta, @auth/prisma-adapter, prisma, @prisma/client, zod"
    - path: "prisma/schema.prisma"
      provides: "Auth.js adapter schema with User, Account, Session, VerificationToken models"
      contains: "model Session"
    - path: "lib/db.ts"
      provides: "Prisma client singleton preventing multiple connections in dev hot reload"
      exports: ["prisma"]
    - path: ".env.local"
      provides: "DATABASE_URL, DATABASE_URL_UNPOOLED placeholders (user must fill in)"
  key_links:
    - from: "lib/db.ts"
      to: "prisma/schema.prisma"
      via: "PrismaClient instantiation"
      pattern: "new PrismaClient"
    - from: "prisma/schema.prisma"
      to: "Neon database"
      via: "prisma migrate dev"
      pattern: "url.*DATABASE_URL"

user_setup:
  - service: neon
    why: "Postgres database for Auth.js session persistence"
    env_vars:
      - name: DATABASE_URL
        source: "Neon Dashboard -> your project -> Connection string -> Pooled connection"
      - name: DATABASE_URL_UNPOOLED
        source: "Neon Dashboard -> your project -> Connection string -> Direct connection (toggle off pooling)"
    dashboard_config:
      - task: "Create a Neon project (or use existing)"
        location: "https://console.neon.tech"
---

<objective>
Scaffold the Next.js 16 application, set up the Prisma schema with all Auth.js-required tables, and push the schema to the Neon database.

Purpose: Establishes the database layer that Auth.js depends on. Without the Session table in the database, the Prisma adapter cannot persist sessions, and AUTH-03 (session persistence across navigations) cannot be satisfied.
Output: A running Next.js 16 app with Prisma connected to Neon and the Auth.js schema migrated.
</objective>

<execution_context>
@/Users/davidkwartler/.claude/get-shit-done/workflows/execute-plan.md
@/Users/davidkwartler/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-foundation/01-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold Next.js 16 project and install all Phase 1 dependencies</name>
  <files>package.json, tsconfig.json, next.config.ts, tailwind.config.ts, .gitignore</files>
  <action>
    Run the scaffold command from the project root (the sentinel/ directory already exists as the git repo root — scaffold INTO the current directory, not a subdirectory):

    ```bash
    node --version   # Must be 20.9.0+ per Next.js 16 requirement. Abort if not.
    npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
    ```

    When prompted, answer:
    - "Would you like to use src/ directory?" → Yes (--src-dir flag should handle this)
    - All other prompts → accept defaults

    Then install all Phase 1 dependencies:
    ```bash
    npm install next-auth@beta @auth/prisma-adapter
    npm install prisma @prisma/client zod
    ```

    After installation, verify package.json contains:
    - `"next"` at version `^16.x` (NOT 15.x)
    - `"next-auth"` at version `5.0.0-beta.x` (NOT `4.x`)
    - `"@auth/prisma-adapter"` at `^2.x`
    - `"prisma"` and `"@prisma/client"` at `^7.x`
    - `"zod"` at `^4.x`

    If `npm install next-auth@beta` installs v4 instead of v5 (check `node_modules/next-auth/package.json`), run `npm install next-auth@5.0.0-beta.30` explicitly.

    Do NOT create middleware.ts — Next.js 16 uses proxy.ts (created in Plan 02).
    Do NOT modify the default next.config.ts — leave as scaffolded.
  </action>
  <verify>
    <automated>node --version && cat package.json | grep -E '"next"|"next-auth"|"@auth/prisma-adapter"|"prisma"'</automated>
  </verify>
  <done>
    - `node --version` reports 20.9.0 or higher
    - package.json lists next@16.x, next-auth@5.0.0-beta.x, @auth/prisma-adapter@2.x, prisma@7.x
    - `npm run dev` starts without compilation errors (Ctrl+C to stop after confirming)
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Prisma schema with Auth.js tables and push to Neon</name>
  <files>prisma/schema.prisma, lib/db.ts, .env.local</files>
  <action>
    **Step 1: Initialize Prisma**
    ```bash
    npx prisma init
    ```
    This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env`.

    **Step 2: Replace prisma/schema.prisma** with the exact Auth.js v5 adapter schema. This schema must match what `@auth/prisma-adapter` expects — do NOT deviate from field names or relations:

    ```prisma
    // prisma/schema.prisma
    datasource db {
      provider  = "postgresql"
      url       = env("DATABASE_URL")
      directUrl = env("DATABASE_URL_UNPOOLED")
    }

    generator client {
      provider = "prisma-client-js"
    }

    model User {
      id            String    @id @default(cuid())
      name          String?
      email         String    @unique
      emailVerified DateTime?
      image         String?
      accounts      Account[]
      sessions      Session[]
    }

    model Account {
      id                String  @id @default(cuid())
      userId            String
      type              String
      provider          String
      providerAccountId String
      refresh_token     String? @db.Text
      access_token      String? @db.Text
      expires_at        Int?
      token_type        String?
      scope             String?
      id_token          String? @db.Text
      session_state     String?
      user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

      @@unique([provider, providerAccountId])
    }

    model Session {
      id           String   @id @default(cuid())
      sessionToken String   @unique
      userId       String
      expires      DateTime
      user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
      // Phase 3+ will add: fingerprintId, flagged, confidenceScore columns
    }

    model VerificationToken {
      identifier String
      token      String   @unique
      expires    DateTime

      @@unique([identifier, token])
    }
    ```

    **Step 3: Create .env.local** (rename/replace the .env that prisma init created — Next.js uses .env.local for local overrides, which takes precedence):
    ```bash
    # .env.local — never commit this file
    DATABASE_URL="postgresql://..."        # Neon pooled connection string — user must fill in
    DATABASE_URL_UNPOOLED="postgresql://..." # Neon direct connection string — user must fill in
    AUTH_SECRET=""                         # Filled in Plan 02 via: npx auth secret
    AUTH_GOOGLE_ID=""                      # Filled in Plan 02
    AUTH_GOOGLE_SECRET=""                  # Filled in Plan 02
    ```

    Add `.env.local` to `.gitignore` if not already present. Also add `.env` to `.gitignore`.

    **Step 4: Create lib/db.ts** — Prisma singleton to prevent multiple client instances during Next.js hot reload:
    ```typescript
    // lib/db.ts
    import { PrismaClient } from "@prisma/client"

    const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

    export const prisma =
      globalForPrisma.prisma ?? new PrismaClient()

    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = prisma
    }
    ```

    **Step 5: Generate Prisma client and push schema to Neon**

    The user MUST have filled in DATABASE_URL and DATABASE_URL_UNPOOLED in .env.local before this step. Check that both are non-empty before running:
    ```bash
    npx prisma generate
    npx prisma db push
    ```

    Use `prisma db push` (not `migrate dev`) for initial setup — it pushes the schema directly without creating a migration history file, which is appropriate for the first deployment.

    After `db push` succeeds, confirm the tables exist:
    ```bash
    npx prisma studio
    ```
    This opens a browser at localhost:5555 — confirm User, Account, Session, VerificationToken tables are visible, then Ctrl+C.

    IMPORTANT: `DATABASE_URL_UNPOOLED` is used by the `directUrl` in schema.prisma for migrations/pushes. Without it, `prisma db push` will fail with a transaction error on Neon's pooled connection.
  </action>
  <verify>
    <automated>npx prisma validate && npx prisma db pull --print | grep -E "model User|model Session|model Account|model VerificationToken"</automated>
  </verify>
  <done>
    - `prisma/schema.prisma` validates without errors
    - `npx prisma db pull --print` output shows all four models: User, Account, Session, VerificationToken
    - `lib/db.ts` exports `prisma` singleton
    - `.env.local` exists with placeholder structure for all required env vars
    - Both `.env` and `.env.local` are in `.gitignore`
  </done>
</task>

</tasks>

<verification>
Run these checks after both tasks complete:

```bash
# 1. Verify Node.js version
node --version   # Must be >= 20.9.0

# 2. Verify Next.js and auth deps
cat package.json | grep -E '"next"|"next-auth"|"@auth/prisma-adapter"|"prisma"|"@prisma/client"'

# 3. Verify Prisma schema is valid
npx prisma validate

# 4. Verify all four Auth.js tables exist in Neon
npx prisma db pull --print | grep "^model"
# Expected output: model User, model Account, model Session, model VerificationToken

# 5. Dev server starts
npm run dev &
sleep 5 && curl -s http://localhost:3000 | grep -c "html" && kill %1
```
</verification>

<success_criteria>
- Node.js 20.9.0+ confirmed
- Next.js 16.x scaffolded with TypeScript, Tailwind, App Router, src/ directory
- next-auth@5.0.0-beta.x installed (NOT v4)
- All four Auth.js Prisma tables deployed to Neon
- `npx prisma validate` exits 0
- `npm run dev` starts without compilation errors
- lib/db.ts exports a Prisma singleton
- .env.local exists with placeholder structure; is gitignored
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-01-SUMMARY.md` documenting:
- Next.js version confirmed
- next-auth beta version pinned
- Neon connection strings configured (note which Neon project)
- Prisma schema pushed successfully
- Any deviations from plan
</output>
