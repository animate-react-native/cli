import chalk from "chalk";
import chalkExtra from "chalk-extra";
import { Command } from "commander";
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { createComponentDir, env, loadAuthConfig } from "./config.js";

export const getAnimationCommand = new Command()
  .name("get")
  .description("Get a new animation")
  .argument("<slug>", "Animation slug")
  .action(async (slug) => {
    const config = loadAuthConfig();
    if (!config) {
      process.exit(1);
    }
    const token = config.token;
    console.log(token);
    try {
      const res = await fetch(`${env.appUrl}/api/cli/code?slug=${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
