#!/usr/bin/env node
import { program } from "commander";
import { createRequire } from "module";
import { getAnimationCommand } from "./getAnimation.js";
import { listCommand } from "./list.js";
import { loginCommand } from "./login.js";
import { previewCommand } from "./preview.js";
import { setupCommand } from "./setup.js";
import { syncCommand } from "./sync.js";

program
  .name("@animatereactnative/ui")
  .description("CLI for AnimateReactNative.com components")
  // The version in package.json, which sits next to dist/ in the published package.
  .version((createRequire(import.meta.url)("../package.json") as { version: string }).version);

program.addCommand(loginCommand);
program.addCommand(getAnimationCommand);
program.addCommand(setupCommand);
program.addCommand(listCommand);
program.addCommand(previewCommand);
program.addCommand(syncCommand);

program.parse();
