import chalk from "chalk";
import { Command } from "commander";
import crypto from "crypto";
import fs from "fs";
import fetch from "node-fetch";
import os from "os";
import path from "path";
import { env } from "./config.js";
import { getAuthConfigWithPrompts } from "./helpers.js";

/**
 * `sync`: a copy of the library on this machine.
 *
 *   ~/.animatereactnative/
 *   ├─ registry.json          every animation, its tags and packages
 *   ├─ animations/<slug>/     the source files, meta.json and PROMPT.md
 *   └─ skill/                 SKILL.md and its references
 *
 * The server sends a fingerprint (sha256) of every file. Only animations with a file that is
 * missing here, or differs, are downloaded, so running it again pulls what was added or changed.
 * A free account gets the free animations; the rest are listed in registry.json as locked.
 */

type RemoteFile = { path: string; hash: string; size: number };
type Animation = {
  slug: string;
  title: string;
  name: string;
  description: string;
  kind: string;
  tags: string[];
  libraries: string[];
  packages: Record<string, string | null>;
  install: string | null;
  free: boolean;
  locked: boolean;
  url: string;
  video: string | null;
  publishedAt: string | null;
  files: RemoteFile[];
  prompt: string;
};
type Listing = {
  status: "success";
  account: { name: string | null; plan: string; member: boolean };
  generatedAt: string;
  skill: RemoteFile[];
  animations: Animation[];
};
type Contents = {
  status: "success";
  animations: { slug: string; files: { path: string; content: string; hash: string }[] }[];
  denied: string[];
  missing: string[];
  skill?: { path: string; content: string; hash: string }[];
};
type Failure = { status: "error"; message: string };

/** A response is capped at a few megabytes, so source is asked for in batches no larger than this. */
const BATCH_BYTES = 2_000_000;
const BATCH_COUNT = 40;

const sha256 = (text: string) => crypto.createHash("sha256").update(text).digest("hex");

/** The file's fingerprint, or null when it isn't there. */
function localHash(file: string): string | null {
  try {
    return sha256(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

/** A path from the server, kept inside `dir`: no absolute paths and no "..". */
function inside(dir: string, relative: string): string {
  const target = path.resolve(dir, relative);
  if (target !== dir && !target.startsWith(dir + path.sep)) throw new Error(`Refusing to write outside ${dir}: ${relative}`);
  return target;
}

/** Writes the file unless it already holds exactly this. Returns whether it wrote. */
function writeIfChanged(file: string, content: string): boolean {
  if (localHash(file) === sha256(content)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf-8");
  return true;
}

const ok = (text: string) => console.log(`${chalk.green("✓")} ${text}`);
const tilde = (dir: string) => (dir.startsWith(os.homedir()) ? "~" + dir.slice(os.homedir().length) : dir);

export const syncCommand = new Command()
  .name("sync")
  .description("Copy the whole library to this machine, or pull what changed since last time")
  .option("--dir <path>", "Where to keep it", path.join(os.homedir(), ".animatereactnative"))
  .option("--force", "Download every animation again, even the ones that look up to date")
  .action(async (options: { dir: string; force?: boolean }) => {
    const started = Date.now();
    const auth = await getAuthConfigWithPrompts();
    if (!auth) return;
    const headers = { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" };
    const call = async <T>(init?: { body: unknown }): Promise<T> => {
      const res = await fetch(`${env.appUrl}/api/cli/sync`, {
        method: init ? "POST" : "GET",
        headers,
        body: init ? JSON.stringify(init.body) : undefined,
      });
      // A site that doesn't have the sync endpoint (yet) answers with a page, not with data.
      if (res.status === 404) throw new Error("Sync isn't available on AnimateReactNative.com yet. Try again soon; `add` and `list` work as before.");
      const data = (await res.json().catch(() => null)) as T | Failure | null;
      if (!res.ok || !data || (data as Failure).status === "error") {
        throw new Error((data as Failure | null)?.message ?? `The server answered ${res.status}.`);
      }
      return data as T;
    };

    try {
      const root = path.resolve(options.dir);
      const listing = await call<Listing>();
      ok(`Signed in · ${listing.account.member ? `${listing.account.plan === "TEAM" ? "Team" : "Pro"} license` : "Free account"}`);

      const open = listing.animations.filter((a) => !a.locked);
      const locked = listing.animations.length - open.length;
      const animationsDir = path.join(root, "animations");

      // Which animations have a file that is missing here or differs. One whose files the server
      // doesn't list yet is always asked for; its contents decide whether anything changed.
      const dirOf = (a: Animation) => inside(animationsDir, a.slug);
      const wanted = open.filter(
        (a) => options.force || !a.files.length || a.files.some((f) => localHash(inside(dirOf(a), f.path)) !== f.hash),
      );

      let added = 0;
      let updated = 0;
      const denied: string[] = [];
      for (let i = 0; i < wanted.length; ) {
        const batch: Animation[] = [];
        let bytes = 0;
        while (i < wanted.length && batch.length < BATCH_COUNT) {
          const size = wanted[i]!.files.reduce((sum, f) => sum + f.size, 0);
          if (batch.length && bytes + size > BATCH_BYTES) break;
          batch.push(wanted[i]!);
          bytes += size;
          i++;
        }
        const contents = await call<Contents>({ body: { slugs: batch.map((a) => a.slug) } });
        denied.push(...contents.denied);
        for (const got of contents.animations) {
          const animation = batch.find((a) => a.slug === got.slug);
          if (!animation || !got.files.length) continue;
          const dir = dirOf(animation);
          const isNew = !fs.existsSync(dir);
          let changed = false;
          for (const file of got.files) changed = writeIfChanged(inside(dir, file.path), file.content) || changed;
          // Files this command wrote before that the animation no longer has.
          const before = readJson<{ files?: string[] }>(path.join(dir, "meta.json"))?.files ?? [];
          for (const old of before) {
            if (!got.files.some((f) => f.path === old)) fs.rmSync(inside(dir, old), { force: true });
          }
          animation.files = got.files.map((f) => ({ path: f.path, hash: f.hash, size: f.content.length }));
          if (isNew) added++;
          else if (changed) updated++;
        }
        process.stdout.write(`\r  ${Math.min(i, wanted.length)} of ${wanted.length} downloaded`);
      }
      if (wanted.length) process.stdout.write("\r" + " ".repeat(40) + "\r");

      // Next to each animation: what it needs, and the prompt that goes with it.
      for (const a of open) {
        const dir = dirOf(a);
        if (!fs.existsSync(dir)) continue;
        const { prompt, locked: _locked, files, description, ...meta } = a;
        writeIfChanged(path.join(dir, "meta.json"), JSON.stringify({ ...meta, description, files: files.map((f) => f.path) }, null, 2) + "\n");
        writeIfChanged(path.join(dir, "PROMPT.md"), prompt + "\n");
      }

      // The skill: the patterns behind the library, for an agent to read.
      const skillDir = path.join(root, "skill");
      if (options.force || listing.skill.some((f) => localHash(inside(skillDir, f.path)) !== f.hash)) {
        const { skill = [] } = await call<Contents>({ body: { slugs: [], skill: true } });
        for (const file of skill) writeIfChanged(inside(skillDir, file.path), file.content);
      }

      // One file that lists everything, locked animations included, so search works offline.
      const registry = {
        syncedAt: new Date().toISOString(),
        source: env.appUrl,
        animations: listing.animations.map(({ prompt: _prompt, files, ...a }) => ({
          ...a,
          path: a.locked || !fs.existsSync(dirOf(a as Animation)) ? null : `animations/${a.slug}`,
          files: files.map((f) => f.path),
        })),
      };
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, "registry.json"), JSON.stringify(registry, null, 2) + "\n", "utf-8");

      const changes = [added && `${added} new`, updated && `${updated} updated`].filter(Boolean).join(", ");
      ok(`${open.length} ${open.length === 1 ? "animation" : "animations"} · ${changes || "already up to date"}`);
      if (locked) {
        console.log(chalk.dim(`  ${locked} more need a license: ${env.appUrl}/pricing`));
      }
      if (denied.length) {
        console.log(chalk.yellow(`  ${denied.length} could not be downloaded with this account.`));
      }
      ok(`Saved to ${chalk.cyan(tilde(root))} ${chalk.dim(`in ${((Date.now() - started) / 1000).toFixed(1)}s`)}`);
      process.exit(0);
    } catch (e) {
      console.error(chalk.red(`❌ ${(e as Error).message}`));
      process.exit(1);
    }
  });

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}
