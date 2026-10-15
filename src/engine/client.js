import * as Comlink from 'comlink';

let engine;

export function getEngine() {
  engine ??= Comlink.wrap(new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
  return engine;
}
export const proxy = Comlink.proxy;
