import chalk from "chalk";
import chalkExtra from "chalk-extra";
import { Command } from "commander";
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { createComponentDir, createInitialConfig, env } from "./config.js";
import { getAuthConfigWithPrompts } from "./helpers.js";

export const getAnimationCommand = new Command()
  .name("add")
  .description("Add a new animation from AnimateReactNative.com")
  .argument("<slug>", "Animation slug")
  .action(async (slug) => {
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
        | { status: "success"; files: { filename: string; content: string }[] }
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
