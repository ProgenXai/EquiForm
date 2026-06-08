/**
 * One-time cleanup: delete all files under selected prefixes in horse-photos.
 * Run locally:
 *   npx ts-node --project tsconfig.json scripts/cleanup-storage.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env or .env.local
 */

import * as fs from "fs";
import * as path from "path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "horse-photos";
const FOLDERS_TO_CLEAN = ["reference", "tripo-input", "full-report-temp"] as const;
const LIST_PAGE_SIZE = 1000;

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const vars: Record<string, string> = {};
  const lines = fs.readFileSync(filePath, "utf8").split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  return vars;
}

function getSupabaseClient(): SupabaseClient {
  const fileEnv = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    fileEnv.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    fileEnv.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or .env.local",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function joinStoragePath(prefix: string, name: string): string {
  return prefix ? `${prefix}/${name}` : name;
}

function isFolder(item: { id: string | null; metadata: Record<string, unknown> | null }): boolean {
  return item.id === null && item.metadata === null;
}

async function listAllItems(
  supabase: SupabaseClient,
  prefix: string,
): Promise<{ name: string; id: string | null; metadata: Record<string, unknown> | null }[]> {
  const items: { name: string; id: string | null; metadata: Record<string, unknown> | null }[] =
    [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`Failed to list "${prefix || "(root)"}": ${error.message}`);
    }

    if (!data?.length) {
      break;
    }

    for (const item of data) {
      items.push({
        name: item.name,
        id: item.id,
        metadata: item.metadata,
      });
    }

    if (data.length < LIST_PAGE_SIZE) {
      break;
    }

    offset += LIST_PAGE_SIZE;
  }

  return items;
}

async function deletePrefixRecursive(
  supabase: SupabaseClient,
  prefix: string,
): Promise<number> {
  const items = await listAllItems(supabase, prefix);
  let deletedCount = 0;
  const filesToRemove: string[] = [];

  for (const item of items) {
    const itemPath = joinStoragePath(prefix, item.name);

    if (isFolder(item)) {
      deletedCount += await deletePrefixRecursive(supabase, itemPath);
      continue;
    }

    filesToRemove.push(itemPath);
  }

  if (filesToRemove.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(filesToRemove);

    if (error) {
      throw new Error(`Failed to delete files under "${prefix}": ${error.message}`);
    }

    deletedCount += filesToRemove.length;
  }

  return deletedCount;
}

async function main() {
  const supabase = getSupabaseClient();

  console.log(`Cleaning bucket "${BUCKET}"...`);
  console.log(`Folders: ${FOLDERS_TO_CLEAN.join(", ")}\n`);

  let totalDeleted = 0;

  for (const folder of FOLDERS_TO_CLEAN) {
    const deleted = await deletePrefixRecursive(supabase, folder);
    totalDeleted += deleted;
    console.log(`${folder}/ — deleted ${deleted} file(s)`);
  }

  console.log(`\nDone. Deleted ${totalDeleted} file(s) total.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
