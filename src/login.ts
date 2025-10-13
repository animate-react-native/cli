import { Command } from "commander";
import { handleLogin } from "./helpers.js";

export const loginCommand = new Command()
  .name("login")
  .description("Authenticate with AnimateReactNative.com")
  .action(async () => {
    await handleLogin();
    process.exit(0);
  });
