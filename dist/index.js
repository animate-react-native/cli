#!/usr/bin/env bun
import { program } from "commander";
import { getAnimationCommand } from "./getAnimation.js";
import { listCommand } from "./list.js";
import { loginCommand } from "./login.js";
import { previewCommand } from "./preview.js";
import { setupCommand } from "./setup.js";
program
    .name("@animatereactnative/ui")
    .description("CLI for AnimateReactNative.com components")
    .version("0.0.1");
program.addCommand(loginCommand);
program.addCommand(getAnimationCommand);
program.addCommand(setupCommand);
program.addCommand(listCommand);
program.addCommand(previewCommand);
program.parse();
