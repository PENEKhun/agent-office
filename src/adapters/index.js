import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ADAPTER_DIRECTORY = dirname(fileURLToPath(import.meta.url));

/** 현재 폴더의 어댑터를 파일명 순으로 불러오기 */
export async function loadAdapters(directory = ADAPTER_DIRECTORY) {
  const files = (await readdir(directory))
    .filter((name) => name.endsWith('.js') && name !== 'index.js')
    .sort();
  const adapters = [];

  for (const file of files) {
    const module = await import(pathToFileURL(join(directory, file)).href);
    if (module.default && typeof module.default.parseLine === 'function') {
      adapters.push(module.default);
    }
  }
  return adapters;
}
