/** In-memory Sink mimicking FSA semantics: a file only exists after close(); abort leaves nothing. */
export function memorySink() {
  const files = new Map();
  const sink = {
    async open(path) {
      const chunks = [];
      return {
        write: async (c) => void chunks.push(c.slice()),
        close: async () => void files.set(path.join('/'), Buffer.concat(chunks)),
        abort: async () => void (chunks.length = 0),
      };
    },
    async writeText(path, text) {
      files.set(path.join('/'), text);
    },
  };
  return { sink, files };
}

export const body = (n, chunk = 4) => {
  const data = new Uint8Array(n).fill(7);
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < n; i += chunk) c.enqueue(data.slice(i, i + chunk));
      c.close();
    },
  });
};

export const mkJob = (over = {}) => ({
  id: 'j',
  categories: ['Category:T'],
  cursors: {},
  enumDone: true,
  pageSize: 10,
  imageinfoBatch: 5,
  options: { delayMs: 0, concurrency: 3 },
  approxTotal: 0,
  enumerated: 0,
  pageCount: 0,
  startedAt: 0,
  ...over,
});

export const mkItem = (i, over = {}) => ({
  pageid: 100 + i,
  jobId: 'j',
  title: `File:LL-${i}.wav`,
  url: `https://u/${i}`,
  size: 10,
  sha1: 's',
  descriptionurl: 'https://c/File:x',
  descriptionshorturl: 'https://c/s/1',
  user: 'u',
  status: 'pending',
  attempts: 0,
  seq: i,
  ...over,
});

export const noSleep = async () => {};
