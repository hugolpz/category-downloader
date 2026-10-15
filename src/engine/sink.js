/** Where bytes go. The browser implementation writes into the user's chosen folder. */

export function fsaSink(root, folder) {
  async function fileHandle(path) {
    let dir = root;
    for (const part of [...(folder ? [folder] : []), ...path.slice(0, -1)]) dir = await dir.getDirectoryHandle(part, { create: true });
    return dir.getFileHandle(path[path.length - 1], { create: true });
  }
  return {
    async open(path) {
      const w = await (await fileHandle(path)).createWritable();
      return {
        write: (chunk) => w.write(chunk),
        close: () => w.close(),
        abort: () => w.abort(),
      };
    },
    async writeText(path, text) {
      const w = await (await fileHandle(path)).createWritable();
      await w.write(text);
      await w.close();
    },
  };
}
