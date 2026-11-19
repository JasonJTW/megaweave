// node --test .agents/skills/contribute/scripts/*.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TIMES, mergeCrontab, parseTimes, renderCron, renderPlist } from "./install-schedule.mjs";

const repo = "/Users/ziyi/code/megaweave";
const path = "/opt/homebrew/bin:/usr/bin:/bin";

describe("parseTimes", () => {
  it("parses 24-hour times and rejects anything else", () => {
    assert.deepEqual(parseTimes(["09:00", "22:30"]), [
      { hour: 9, minute: 0 },
      { hour: 22, minute: 30 },
    ]);
    assert.throws(() => parseTimes(["24:00"]));
    assert.throws(() => parseTimes(["9pm"]));
  });

  it("staggers the two harnesses by default", () => {
    assert.deepEqual(DEFAULT_TIMES.claude, ["09:00", "14:00", "20:00"]);
    assert.deepEqual(DEFAULT_TIMES.codex, ["11:00", "16:00", "22:00"]);
  });
});

describe("renderPlist", () => {
  it("runs run.sh with the harness at each time and captures PATH", () => {
    const plist = renderPlist({
      repo,
      harness: "claude",
      times: parseTimes(DEFAULT_TIMES.claude),
      path: `${path}:/a&b`,
      logDir: "/Users/ziyi/Library/Logs/megaweave-contribute",
    });
    assert.match(plist, /<string>\/Users\/ziyi\/code\/megaweave\/\.agents\/skills\/contribute\/scripts\/run\.sh<\/string>\n\s*<string>claude<\/string>/);
    assert.equal(plist.match(/<key>Hour<\/key>/g).length, 3);
    assert.match(plist, /<integer>20<\/integer>/);
    assert.match(plist, /\/a&amp;b/);
    assert.doesNotMatch(plist, /__[A-Z_]+__/);
  });
});

describe("renderCron", () => {
  it("writes one quoted line per time inside a managed block", () => {
    const block = renderCron({ repo, harness: "codex", times: parseTimes(["11:00", "16:05"]), path });
    const lines = block.split("\n").filter((l) => l && !l.startsWith("#"));
    assert.deepEqual(lines, [
      `0 11 * * * PATH='${path}' '${repo}/.agents/skills/contribute/scripts/run.sh' codex`,
      `5 16 * * * PATH='${path}' '${repo}/.agents/skills/contribute/scripts/run.sh' codex`,
    ]);
  });
});

describe("mergeCrontab", () => {
  const block = "# BEGIN megaweave-contribute\n0 9 * * * x\n# END megaweave-contribute\n";

  it("keeps other entries and replaces an earlier block", () => {
    const existing = `MAILTO=me\n0 1 * * * backup\n${block.replace("0 9", "0 8")}`;
    assert.equal(mergeCrontab(existing, block), `MAILTO=me\n0 1 * * * backup\n${block}`);
  });

  it("removes the block when given none", () => {
    assert.equal(mergeCrontab(`0 1 * * * backup\n${block}`, ""), "0 1 * * * backup\n");
  });
});
