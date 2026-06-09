/**
 * Storage cleanup for horse-photos:
 * - Deletes all files under reference/, tripo-input/, and full-report-temp/
 * - Deletes orphaned GLB files under 3d-models/ not referenced by any report glb_url
 *
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
const GLB_MODELS_PREFIX = "3d-models";
const LIST_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 1000;

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

function extractFilenameFromGlbUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    return last ? decodeURIComponent(last) : null;
  } catch {
    const lastSlash = trimmed.lastIndexOf("/");
    if (lastSlash === -1) return trimmed;
    return decodeURIComponent(trimmed.slice(lastSlash + 1)) || null;
  }
}

async function listAllFilePaths(
  supabase: SupabaseClient,
  prefix: string,
): Promise<string[]> {
  const items = await listAllItems(supabase, prefix);
  const paths: string[] = [];

  for (const item of items) {
    const itemPath = joinStoragePath(prefix, item.name);

    if (isFolder(item)) {
      paths.push(...(await listAllFilePaths(supabase, itemPath)));
      continue;
    }

    paths.push(itemPath);
  }

  return paths;
}

async function fetchReferencedGlbFilenames(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const filenames = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("reports")
      .select("glb_url")
      .not("glb_url", "is", null)
      .range(offset, offset + LIST_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to query reports glb_url: ${error.message}`);
    }

    if (!data?.length) {
      break;
    }

    for (const row of data) {
      const glbUrl = typeof row.glb_url === "string" ? row.glb_url.trim() : "";
      if (!glbUrl) continue;

      const filename = extractFilenameFromGlbUrl(glbUrl);
      if (filename) {
        filenames.add(filename);
      }
    }

    if (data.length < LIST_PAGE_SIZE) {
      break;
    }

    offset += LIST_PAGE_SIZE;
  }

  return filenames;
}

async function cleanupOrphanedGlbFiles(supabase: SupabaseClient): Promise<number> {
  console.log(`\nChecking orphaned GLB files under "${GLB_MODELS_PREFIX}/"...`);

  const referencedFilenames = await fetchReferencedGlbFilenames(supabase);
  const storagePaths = await listAllFilePaths(supabase, GLB_MODELS_PREFIX);

  const orphanedPaths = storagePaths.filter((storagePath) => {
    const filename = storagePath.split("/").pop();
    return filename && !referencedFilenames.has(filename);
  });

  if (orphanedPaths.length === 0) {
    console.log(`${GLB_MODELS_PREFIX}/ — deleted 0 orphaned GLB file(s)`);
    return 0;
  }

  let deletedCount = 0;

  for (let i = 0; i < orphanedPaths.length; i += REMOVE_BATCH_SIZE) {
    const batch = orphanedPaths.slice(i, i + REMOVE_BATCH_SIZE);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);

    if (error) {
      throw new Error(`Failed to delete orphaned GLB files: ${error.message}`);
    }

    deletedCount += batch.length;
  }

  console.log(
    `${GLB_MODELS_PREFIX}/ — deleted ${deletedCount} orphaned GLB file(s)`,
  );
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

  totalDeleted += await cleanupOrphanedGlbFiles(supabase);

  console.log(`\nDone. Deleted ${totalDeleted} file(s) total.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
