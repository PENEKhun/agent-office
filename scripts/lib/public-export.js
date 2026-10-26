import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT_FILES = new Set([
  'server.js', 'config.example.json', 'package.json', 'CHANGELOG.md', 'LICENSE', 'NOTICE.md', 'README.md'
]);
const SCRIPT_EXCLUDES = new Set([
  'scripts/make-release-notes.mjs', 'scripts/lib/release-data.mjs', 'scripts/export-public.mjs'
]);
const IMAGE_FILES = new Set(['docs/images/office.png', 'docs/images/space.png', 'docs/images/restaurant.png', 'docs/images/widget.png']);

export function normalizePublicPath(value) {
  if (typeof value !== 'string') return null;
  const path = value.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!path || path.startsWith('/') || /^[A-Za-z]:/u.test(path) || path.split('/').some((part) => part === '..')) return null;
  return path.replace(/\/{2,}/gu, '/').replace(/\/$/u, '');
}

export function isAllowedPublicPath(value) {
  const path = normalizePublicPath(value);
  if (!path) return false;
  if (ROOT_FILES.has(path) || path === 'docs' || path === 'docs/images' || path === 'docs/SPEC.md' || path === 'docs/INSTALL.md' || IMAGE_FILES.has(path)) return true;
  if (path === 'src' || path.startsWith('src/')) return true;
  if (path === 'test' || path.startsWith('test/')) return true;
  if (path === 'public' || path.startsWith('public/')) return true;
  if (path === 'desktop' || path.startsWith('desktop/')) {
    return !path.split('/').some((part) => part === 'target' || part === 'gen');
  }
  if (path === 'scripts' || path.startsWith('scripts/')) return !SCRIPT_EXCLUDES.has(path);
  return false;
}

export function findDeniedStrings(text, denyValues) {
  if (typeof text !== 'string') return [];
  const lowerText = text.toLocaleLowerCase('en-US');
  return [...new Set(denyValues.filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()).filter((value) => lowerText.includes(value.toLocaleLowerCase('en-US'))))];
}

function copyDirectory(sourceRoot, outputRoot, relativeDirectory) {
  const sourceDirectory = join(sourceRoot, relativeDirectory);
  if (!existsSync(sourceDirectory) || !lstatSync(sourceDirectory).isDirectory()) return;
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    const relativePath = [relativeDirectory, entry.name].filter(Boolean).join('/');
    if (!isAllowedPublicPath(relativePath)) continue;
    const sourcePath = join(sourceRoot, relativePath);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) copyDirectory(sourceRoot, outputRoot, relativePath);
    else if (entry.isFile()) {
      const outputPath = join(outputRoot, relativePath);
      mkdirSync(dirname(outputPath), { recursive: true });
      copyFileSync(sourcePath, outputPath);
    }
  }
}

export function copyPublicTree(sourceRoot, outputRoot) {
  const source = resolve(sourceRoot);
  const output = resolve(outputRoot);
  const rel = relative(source, output);
  if (!rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !/^[A-Za-z]:/u.test(rel))) {
    throw new Error('내보내기 폴더는 저장소 바깥에 있어야 합니다.');
  }
  mkdirSync(output, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!isAllowedPublicPath(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) copyDirectory(source, output, entry.name);
    else if (entry.isFile()) {
      const outputPath = join(output, entry.name);
      mkdirSync(dirname(outputPath), { recursive: true });
      copyFileSync(join(source, entry.name), outputPath);
    }
  }
}

export function findDeniedFiles(root, denyValues) {
  const matches = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile()) {
        const content = readFileSync(filePath);
        if (content.includes(0)) continue;
        const hits = findDeniedStrings(content.toString('utf8'), denyValues);
        if (hits.length) matches.push({ path: relative(root, filePath).split(sep).join('/'), values: hits });
      }
    }
  };
  visit(root);
  return matches;
}
