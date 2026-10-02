import { execFileSync } from "child_process";
import path from "path";
import { test as setup } from "@playwright/test";

// Wipe the local E2E stack and re-create the test account before every run.
// The server script refuses to touch any data store without the isolation marker.
setup("reset E2E data", () => {
  setup.skip(!!process.env.E2E_BASE_URL, "remote target: not resetting data");

  try {
    execFileSync("npm", ["run", "--silent", "e2e:seed"], {
      cwd: path.join(__dirname, "../../server"),
      stdio: "pipe",
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`npm run e2e:seed failed (is \`make e2e-up\` running?)\n${stdout}${stderr}`);
  }
});
