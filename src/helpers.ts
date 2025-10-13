import chalk from "chalk";
import chalkExtra from "chalk-extra";
import crypto from "crypto";
import fetch from "node-fetch";
import open from "open";
import { env, saveAuthConfig } from "./config.js";

export const handleLogin = async () => {
  const code = crypto.randomBytes(8).toString("hex");
  const loginUrl = `${env.appUrl}/cli?code=${code}`;
  const spinner = chalkExtra.spinner("Opening browser for login...").start();
  open(loginUrl);

  // Poll backend for token
  spinner.info("Waiting for authentication...");
  let token: string | null = null;
  let name = "";

  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${env.appUrl}/api/cli/exchange?code=${code}`);
    const data = (await res.json()) as {
      status: string;
      token: string;
      name?: string;
    };

    if (data.status === "success") {
      token = data.token;
      name = data.name || "";
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!token) {
    console.error(chalkExtra.ascii("Login timed out."));
    process.exit(1);
  }

  saveAuthConfig({
    token,
  });

  spinner.succeed(`Logged in successfully!`);
  spinner.stop();
  console.log(
    chalk.blue(`Welcome to AnimateReactNative CLI${name ? `, ${name}` : ""}!`)
  );
};
