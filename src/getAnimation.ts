import chalk from "chalk";
import chalkExtra from "chalk-extra";
import { spawnSync } from "child_process";
import { Command } from "commander";
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { createComponentDir, createInitialConfig, env } from "./config.js";
import { getAuthConfigWithPrompts } from "./helpers.js";

/** Never installed by `add`: every React Native project has them already. */
const GIVEN = new Set(["react", "react-native", "expo"]);

/**
 * Installs what the animation imports and the project does not have yet. In an Expo project it is
 * `npx expo install`, which picks the versions that go with the project's SDK; anywhere else it is
 * the project's own package manager, told by its lockfile.
 * Returns the command it ran (or would have run), or null when there was nothing to install.
 */
export function installPackages(packages: string[], run: boolean): { command: string; ok: boolean } | null {
  const file = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(file)) return null;
  const pkg = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, Record<string, string> | undefined>;
  const have = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  const missing = packages.filter((name) => !GIVEN.has(name) && !(name in have));
  if (!missing.length) return null;

  const has = (lock: string) => fs.existsSync(path.join(process.cwd(), lock));
  const args = "expo" in have
    ? ["npx", "expo", "install", ...missing]
    : has("bun.lockb") || has("bun.lock")
      ? ["bun", "add", ...missing]
      : has("pnpm-lock.yaml")
        ? ["pnpm", "add", ...missing]
        : has("yarn.lock")
          ? ["yarn", "add", ...missing]
          : ["npm", "install", ...missing];
  const command = args.join(" ");
  if (!run) return { command, ok: false };
  console.log(chalk.dim(`\n$ ${command}`));
  const done = spawnSync(args[0] as string, args.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
  return { command, ok: done.status === 0 };
}

export const getAnimationCommand = new Command()
  .name("add")
  .description("Add a new animation from AnimateReactNative.com, and install the packages it needs")
  .argument("<slug>", "Animation slug")
  .option("--no-install", "Only write the files; print the install command instead of running it")
  .action(async (slug, options: { install: boolean }) => {
    const config = await getAuthConfigWithPrompts();
    if (!config) {
      // console.log(chalk.red("❌ Ups, you need to be logged in!"));
      return;
    }
    const token = config.token;
    try {
      const res = await fetch(
        `${env.appUrl}/api/cli/code?slug=${encodeURIComponent(slug)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = (await res.json()) as
        | { status: "success"; files: { filename: string; content: string }[]; packages?: Record<string, string | null> }
        | { status: "error"; message: string };

      if (data.status === "error") {
        throw new Error(data.message);
      }

      const spinner = chalkExtra.spinner("Creating component...").start();
      spinner.stopAndPersist({
        symbol: "🛠",
        text: " Getting the animation",
      });
      await createInitialConfig();
      // console.log(chalk.green(`✅ Component`));
      const componentPath = await createComponentDir(slug);
      spinner.stopAndPersist({
        symbol: "✅",
        text: `Animation created!`,
      });
      // spinner.text = `✅ Component directory created!`;
      data.files.forEach((file) => {
        // Ensure directory exists
        fs.writeFileSync(
          path.join(componentPath, file.filename),
          file.content,
          "utf-8"
        );
      });
      spinner.succeed(`Animation stored successfully!`).stop();
      console.log(chalk.blue(`👉 ${componentPath}`));

      // What it imports and the project is missing. Never the reason `add` fails: the files are in.
      try {
        const installed = installPackages(Object.keys(data.packages ?? {}), options.install);
        if (installed?.ok) console.log(chalk.green("✅ Packages installed"));
        else if (installed) console.log(chalk.yellow(`\n${options.install ? "The packages could not be installed. Run" : "It needs these packages. Run"}:\n  ${installed.command}`));
      } catch (e) {
        console.log(chalk.yellow(`\nCould not check the packages it needs: ${e}`));
      }

      console.log(
        chalkExtra.air(
          "\nEnjoy it! Thank you for using AnimateReactNative.com!"
        )
      );
      process.exit(0);
    } catch (e) {
      console.error(chalk.red(`❌ ${e}`));
      // process.exit(1);
    }
  });
