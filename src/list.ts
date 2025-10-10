import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import fetch from "node-fetch";
import ora from "ora";
import process from "process";
import {
  env,
  isCacheExpired,
  loadAuthConfig,
  loadCache,
  saveCache,
} from "./config.js";

// ---- CLI Command ----

export const listCommand = new Command()
  .name("list")
  .description("List available animations/components")
  .option("--search <query>", "Search by name or description")
  .option("--refresh", "Force refresh from remote instead of cache")
  .action(async (options) => {
    const baseUrl = env.appUrl;
    const spinner = ora("Fetching available components...").start();

    try {
      let components;
      let useCache = false;

      // Load from cache if not explicitly refreshing
      if (!options.refresh) {
        const cached = loadCache();

        if (cached && !isCacheExpired(cached)) {
          spinner.succeed("Loaded components from local cache");
          components = cached;
          useCache = true;
        } else if (cached && isCacheExpired(cached)) {
          spinner.info("Cache expired, refreshing from remote...");
        }
      }

      // Fetch fresh data if no valid cache
      if (!components) {
        const auth = loadAuthConfig();
        const res = await fetch(`${baseUrl}/api/cli/list`, {
          headers: {
            "Content-Type": "application/json",
            ...(auth?.token && { Authorization: `Bearer ${auth.token}` }),
          },
        });

        if (!res.ok) {
          spinner.fail(`Failed to fetch components (${res.status})`);
          process.exit(1);
        }

        const json = await res.json();
        components = json;
        saveCache(json);
        spinner.succeed("Fetched and cached components successfully");
      }

      // Apply filters
      let filtered = components.animations as {
        title: string;
        slug: string;
        tags: string[];
        description?: string;
      }[];
      if (options.search) {
        const q = options.search.toLowerCase();
        filtered = filtered.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.slug.toLowerCase().includes(q) ||
            c.tags?.some((tag) => tag.toLowerCase().includes(q))
        );
      }

      if (!filtered.length) {
        console.log(chalk.yellow("No components found for your filters."));
        return;
      }

      // Pretty table output
      const table = new Table({
        head: [chalk.cyan("Name"), chalk.cyan("Slug")],
        style: { head: [], border: [] },
      });

      filtered.forEach((item: any) => {
        table.push([chalk.green(item.title), item.slug]);
      });

      console.log("\n" + table.toString() + "\n");
      console.log(
        // chalk.dim(
        //   `Found ${filtered.length} component(s) ${
        //     useCache ? "(from cache)" : "(fresh)"
        //   }`
        // )
        chalk.dim(`Found ${filtered.length} component(s)`)
      );
    } catch (err) {
      spinner.fail("Error fetching components");
      console.error(chalk.red((err as Error).message));
    }

    process.exit(0);
  });
