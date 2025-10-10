import chalk from "chalk";
import { Command } from "commander";
import qrcode from "qrcode-terminal";

export const previewCommand = new Command()
  .name("preview")
  .description("Get the preview QR code for an animation")
  .argument("<slug>")
  .action(async (slug) => {
    qrcode.generate(`animatereactnative://posts/${slug}`, {
      small: true,
    });
    console.log(
      chalk.blue(`👉 Scan the QR code with AnimateReactNative.com app`)
    );
    console.log(
      chalk.blue(`Learn more at https://animatereactnative.com/preview-app`)
    );

    process.exit(0);
  });
