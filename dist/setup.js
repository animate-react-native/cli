import { Command } from "commander";
import { createInitialConfig } from "./config.js";
export const setupCommand = new Command()
    .name("config")
    .description("CLI configuration. Where to save downloaded components")
    .action(async () => {
    await createInitialConfig();
});
