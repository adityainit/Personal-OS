/**
 * Runs the real Supabase migrations inside PGlite (in-process Postgres) with a
 * minimal stub of the Supabase `auth` schema, so business rules and RLS can be
 * tested without Docker or a cloud project.
 */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema extensions;
  grant usage on schema public, extensions, auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  grant execute on all functions in schema auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  create schema cron;
  create table cron.jobs (name text, schedule text, command text);
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$
    insert into cron.jobs values (n, s, c); select 1::bigint
  $$;
`;

export const USER_A = "00000000-0000-0000-0000-00000000000a";
export const USER_B = "00000000-0000-0000-0000-00000000000b";

const MIGRATIONS = join(__dirname, "..", "..", "supabase", "migrations");

const migrationFiles = () => readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const runMigration = (db: PGlite, file: string) =>
  db.exec(readFileSync(join(MIGRATIONS, file), "utf8").replace(/create extension if not exists pg_cron;/g, ""));

const SEED_USERS = `insert into private.allowed_emails values ('a@example.com'), ('b@example.com');
  insert into auth.users (id, email) values
  ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com');`;

/** A fresh database with every migration applied and two users. */
export async function createDb() {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) await runMigration(db, file);
  await db.exec(SEED_USERS);
  return db;
}


/** Run statements as an authenticated user (optionally as the Claude OAuth client). */
export async function as<T = Record<string, unknown>>(
  db: PGlite,
  user: string,
  sql: string,
  params: unknown[] = [],
  opts: { claude?: boolean } = {},
) {
  const claims = JSON.stringify({
    sub: user,
    role: "authenticated",
    ...(opts.claude ? { client_id: "claude-mcp-client" } : {}),
  });
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '${claims}', false);`);
  try {
    const res = await db.query<T>(sql, params);
    return res.rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
  }
}

/** Run as superuser (like pg_cron does). */
export async function asSystem<T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []) {
  const res = await db.query<T>(sql, params);
  return res.rows;
}
