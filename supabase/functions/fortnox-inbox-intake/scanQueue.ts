export type ScanFolder = { base: "inbox" | "archive"; query: string; label: string; depth: number; source: string };
export type ScanFile = { id: string; name: string; path: string; date: string | null; base: "inbox" | "archive" };
export type ScanState = { folders: ScanFolder[]; files: ScanFile[] };

export function startScan(state: ScanState, roots: ScanFolder[]) {
  // Never restart at roots while any folder or file from the previous pass remains.
  if (!state.folders.length && !state.files.length) state.folders.push(...roots);
}

export async function discoverFolders(
  state: ScanState, read: (folder: ScanFolder) => Promise<{ files: ScanFile[]; folders: { id: string; name: string }[] }>,
  checkpoint: () => Promise<void>, outOfTime: () => boolean,
  onError: (folder: ScanFolder, error: unknown) => void,
  maxFolders = 3, maxDepth = 3,
) {
  // Each queued folder is attempted at most once per invocation, including failures.
  const attempts = Math.min(maxFolders, state.folders.length);
  let readCount = 0;
  for (let i = 0; i < attempts && !outOfTime(); i++) {
    const item = state.folders.shift();
    if (!item) break;
    readCount++;
    try {
      const result = await read(item);
      for (const file of result.files) {
        if (!state.files.some((f) => f.base === file.base && f.id === file.id)) state.files.push(file);
      }
      if (item.depth < maxDepth) for (const folder of result.folders) {
        const query = `?folderid=${encodeURIComponent(folder.id)}`;
        if (!state.folders.some((f) => f.base === item.base && f.query === query)) {
          state.folders.push({ ...item, query, label: `${item.label}/${folder.name}`, depth: item.depth + 1 });
        }
      }
    } catch (error) {
      state.folders.push(item);
      onError(item, error);
    }
    await checkpoint();
  }
  return readCount;
}