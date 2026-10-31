import { describe, expect, it } from "vitest";
import { discoverFolders, startScan, type ScanState, type ScanFolder } from "../../supabase/functions/fortnox-inbox-intake/scanQueue";

const roots: ScanFolder[] = Array.from({ length: 5 }, (_, n) => ({ base: "inbox", query: `root${n}`, label: `root${n}`, depth: 0, source: "inbox" }));
const file = { base: "inbox" as const, id: "f1", name: "invoice.pdf", path: "root0", date: "2026-10-31" };
describe("resumable Fortnox folder queue", () => {
  it("reaches all five roots and two child levels over three-folder runs", async () => {
    let state: ScanState = { folders: [], files: [] };
    const visited: string[] = [];
    startScan(state, roots);
    for (let run = 0; run < 10 && state.folders.length; run++) {
      let snapshot = "";
      const count = await discoverFolders(state, async (folder) => {
        visited.push(folder.query);
        return { files: [], folders: folder.depth < 2 ? [{ id: `${folder.query}-child`, name: "child" }] : [] };
      }, async () => { snapshot = JSON.stringify(state); }, () => false, () => {});
      expect(count).toBeLessThanOrEqual(3);
      state = JSON.parse(snapshot);
      startScan(state, roots); // do not start a new pass before all queued work is consumed
      if (visited.length === 15) break;
    }
    expect(new Set(visited).size).toBe(15);
  });
  it("retains a failed folder, without retrying it repeatedly in the same run", async () => {
    const state: ScanState = { folders: [roots[0]], files: [] };
    let attempts = 0;
    await discoverFolders(state, async () => { attempts++; throw new Error("temporary"); }, async () => {}, () => false, () => {});
    expect(attempts).toBe(1);
    expect(state.folders).toEqual([roots[0]]);
    await discoverFolders(state, async () => ({ files: [file], folders: [] }), async () => {}, () => false, () => {});
    expect(state.folders).toEqual([]);
    expect(state.files).toEqual([file]);
  });
  it("keeps files and remaining folders when the time budget expires", async () => {
    const state: ScanState = { folders: [...roots], files: [] };
    let expired = false;
    await discoverFolders(state, async () => ({ files: [file], folders: [] }), async () => { expired = true; }, () => expired, () => {});
    expect(state.folders).toHaveLength(4);
    expect(state.files).toEqual([file]);
    const resumed: ScanState = JSON.parse(JSON.stringify(state));
    startScan(resumed, roots);
    expect(resumed.folders).toHaveLength(4);
    expect(resumed.files).toEqual([file]);
  });
  it("does not duplicate queued files and waits for file processing before restarting roots", async () => {
    const state: ScanState = { folders: [roots[0]], files: [file] };
    await discoverFolders(state, async () => ({ files: [file], folders: [] }), async () => {}, () => false, () => {});
    startScan(state, roots);
    expect(state.files).toEqual([file]);
    expect(state.folders).toEqual([]);
    state.files = [];
    startScan(state, roots);
    expect(state.folders).toEqual(roots);
  });
});