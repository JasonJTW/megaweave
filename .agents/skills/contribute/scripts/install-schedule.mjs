#!/usr/bin/env node
// Renders the schedule for scripts/run.sh from ../schedule/*.template and, with
// --install, installs it: a launchd agent on macOS, a crontab block elsewhere.
//
//   node .agents/skills/contribute/scripts/install-schedule.mjs <claude|codex> [HH:MM ...] [--install | --uninstall]
//
// Without a flag it only prints what it would install. Default times stagger the two
// contributors: claude 09:00 14:00 20:00, codex 11:00 16:00 22:00 (local time).
// PATH is captured from the current shell, so the scheduled run finds node, gh, docker
// and the agent CLI where setup found them.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LABEL = "net.megaweaving.contribute";
export const DEFAULT_TIMES = { claude: ["09:00", "14:00", "20:00"], codex: ["11:00", "16:00", "22:00"] };
const here = dirname(fileURLToPath(import.meta.url));
const template = (name) => readFileSync(join(here, "..", "schedule", name), "utf8");

export function parseTimes(times) {
  return times.map((t) => {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
    if (!m) throw new Error(`Invalid time ${t}: use HH:MM (24-hour)`);
    return { hour: Number(m[1]), minute: Number(m[2]) };
  });
}

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sh = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

export function renderPlist({ repo, harness, times, path, logDir }) {
  const calendar = times
    .map(
      ({ hour, minute }) =>
        `    <dict>\n      <key>Hour</key>\n      <integer>${hour}</integer>\n      <key>Minute</key>\n      <integer>${minute}</integer>\n    </dict>`,
    )
    .join("\n");
  return template("launchd.plist.template")
    .replaceAll("__REPO__", xml(repo))
    .replaceAll("__HARNESS__", harness)
    .replaceAll("__PATH__", xml(path))
    .replaceAll("__LOG_DIR__", xml(logDir))
    .replace("__CALENDAR__", calendar);
}

export function renderCron({ repo, harness, times, path }) {
  const run = `${repo}/.agents/skills/contribute/scripts/run.sh`;
  const lines = times
    .map(({ hour, minute }) => `${minute} ${hour} * * * PATH=${sh(path)} ${sh(run)} ${harness}`)
    .join("\n");
  return template("crontab.template").replace("__CRON_LINES__", lines);
}

/** Replaces (or removes, with block "") the managed block in an existing crontab. */
export function mergeCrontab(existing, block) {
  const kept = existing.replace(/# BEGIN megaweave-contribute[\s\S]*?# END megaweave-contribute\n?/, "");
  const base = kept.trimEnd();
  return [base, block.trimEnd()].filter(Boolean).join("\n") + "\n";
}

function main(argv) {
  const harness = argv[0];
  if (!Object.hasOwn(DEFAULT_TIMES, harness)) {
    console.error("usage: install-schedule.mjs <claude|codex> [HH:MM ...] [--install | --uninstall]");
    process.exitCode = 2;
    return;
  }
  const flags = argv.filter((a) => a.startsWith("--"));
  const given = argv.slice(1).filter((a) => !a.startsWith("--"));
  const times = parseTimes(given.length ? given : DEFAULT_TIMES[harness]);
  const repo = resolve(here, "../../../..");
  const path = process.env.PATH;
  const mac = platform() === "darwin";

  if (mac) {
    const logDir = join(homedir(), "Library/Logs/megaweave-contribute");
    const target = join(homedir(), "Library/LaunchAgents", `${LABEL}.plist`);
    const domain = `gui/${process.getuid()}`;
    const bootout = () => {
      try {
        execFileSync("launchctl", ["bootout", `${domain}/${LABEL}`], { stdio: "ignore" });
      } catch {
        // not loaded
      }
    };
    if (flags.includes("--uninstall")) {
      bootout();
      rmSync(target, { force: true });
      console.log(`Removed ${target}`);
      return;
    }
    const plist = renderPlist({ repo, harness, times, path, logDir });
    if (!flags.includes("--install")) {
      console.log(`Would write ${target}:\n\n${plist}`);
      return;
    }
    mkdirSync(logDir, { recursive: true });
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, plist);
    bootout();
    execFileSync("launchctl", ["bootstrap", domain, target], { stdio: "inherit" });
    console.log(`Installed ${target}. Test now: launchctl kickstart ${domain}/${LABEL}`);
    return;
  }

  let existing = "";
  try {
    existing = execFileSync("crontab", ["-l"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    // no crontab yet
  }
  const block = flags.includes("--uninstall") ? "" : renderCron({ repo, harness, times, path });
  const merged = mergeCrontab(existing, block);
  if (!flags.includes("--install") && !flags.includes("--uninstall")) {
    console.log(`Would install this crontab:\n\n${merged}`);
    return;
  }
  execFileSync("crontab", ["-"], { input: merged });
  console.log(flags.includes("--uninstall") ? "Removed the crontab block." : "Installed the crontab block.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
