import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'dist');
const sourceRoots = ['src', 'vendor'];
const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const rawTextExtensions = ['.md', '.txt'];
const macroDefinition = JSON.stringify({
  VERSION: '2.1.88',
  PACKAGE_URL: '@anthropic-ai/claude-code',
  README_URL: 'https://code.claude.com/docs/en/overview',
  FEEDBACK_CHANNEL: 'https://github.com/anthropics/claude-code/issues',
  BUILD_TIME: '2026-03-30T21:59:52Z',
  ISSUES_EXPLAINER: 'report the issue at https://github.com/anthropics/claude-code/issues',
  NATIVE_PACKAGE_URL: null,
  VERSION_CHANGELOG: null
});

const generatedFiles = new Set();
const rawAssetModules = new Map();
const missingModuleInfo = new Map();
const unavailableExternalInfo = new Map();

const generatedSpecMap = new Map([
  ['bun:bundle', '__generated__/bun-bundle.js'],
  ['bun:ffi', '__generated__/bun-ffi.js'],
  ['image-processor-napi', 'vendor/image-processor-src/index.js'],
  ['audio-capture-napi', 'vendor/audio-capture-src/index.js'],
  ['modifiers-napi', 'vendor/modifiers-napi-src/index.js'],
  ['url-handler-napi', 'vendor/url-handler-src/index.js'],
  ['color-diff-napi', 'src/native-ts/color-diff/index.js'],
  ['@ant/claude-for-chrome-mcp', '__generated__/externals/ant-claude-for-chrome-mcp.js'],
  ['@ant/computer-use-mcp', '__generated__/externals/ant-computer-use-mcp.js'],
  ['@ant/computer-use-mcp/sentinelApps', '__generated__/externals/ant-computer-use-mcp-sentinelApps.js'],
  ['@ant/computer-use-mcp/types', '__generated__/externals/ant-computer-use-mcp-types.js'],
  ['@ant/computer-use-input', '__generated__/externals/ant-computer-use-input.js'],
  ['@ant/computer-use-swift', '__generated__/externals/ant-computer-use-swift.js']
]);

const moduleSpecPattern =
  /\b(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?(['"])([^'"`\n]+)\1|require\(\s*(['"])([^'"`\n]+)\3\s*\)|import\(\s*(['"])([^'"`\n]+)\5\s*\)/g;
const importFromPattern =
  /\b(import|export)\s+([^'"`\n]*?)\s+from\s+['"]([^'"`\n]+)['"]/g;
const requireMemberPattern = /require\(\s*['"]([^'"`\n]+)['"]\s*\)\.(\w+)/g;

await fs.rm(outDir, { recursive: true, force: true });

const sourceFiles = (await Promise.all(sourceRoots.map(root => walkDirectory(path.join(projectRoot, root))))).flat();

for (const sourceFile of sourceFiles) {
  const sourceRel = toPosix(path.relative(projectRoot, sourceFile));
  const sourceText = await fs.readFile(sourceFile, 'utf8');
  collectMissingModuleUsage(sourceRel, sourceText);
}

for (const sourceFile of sourceFiles) {
  const sourceRel = toPosix(path.relative(projectRoot, sourceFile));
  const sourceText = await fs.readFile(sourceFile, 'utf8');
  const rewritten = rewriteSourceText(sourceRel, sourceText);
  const outputRel = toOutputCodePath(sourceRel);
  const outputAbs = path.join(outDir, outputRel);

  await fs.mkdir(path.dirname(outputAbs), { recursive: true });
  const compiled = await transform(withRequireShim(rewritten), {
    format: 'esm',
    platform: 'node',
    target: 'node18',
    loader: getEsbuildLoader(sourceRel),
    define: {
      MACRO: macroDefinition
    },
    jsx: 'automatic',
    charset: 'utf8',
    legalComments: 'none'
  });
  await fs.writeFile(outputAbs, compiled.code, 'utf8');
  generatedFiles.add(outputRel);
}

for (const [assetSourceRel, assetModuleRel] of rawAssetModules) {
  if (generatedFiles.has(assetModuleRel)) {
    continue;
  }
  const assetAbs = path.join(projectRoot, assetSourceRel);
  let contents = '';
  try {
    contents = await fs.readFile(assetAbs, 'utf8');
  } catch {
    contents = '';
  }
  await writeGeneratedFile(
    assetModuleRel,
    `export default ${JSON.stringify(contents)};\n`
  );
}

await writeGeneratedFile(
  '__generated__/bun-bundle.js',
  `function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function feature(name) {
  const envKey = 'CLAUDE_CODE_FEATURE_' + String(name).toUpperCase();
  if (process.env[envKey] != null) {
    return isTruthy(process.env[envKey]);
  }
  const list = process.env.CLAUDE_CODE_FEATURES;
  if (!list) {
    return false;
  }
  return list
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .includes(String(name));
}

export default { feature };
`
);

await writeGeneratedFile(
  '__generated__/bun-ffi.js',
  `function unsupported() {
  throw new Error('bun:ffi is not available in the npm rebuild. This code path requires Bun-specific FFI support.');
}

export const dlopen = unsupported;
export const suffix = process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so';
export default { dlopen, suffix };
`
);

await writeGeneratedFile(
  '__generated__/externals/ant-claude-for-chrome-mcp.js',
  `export const BROWSER_TOOLS = [];
export default { BROWSER_TOOLS };
`
);

await writeGeneratedFile(
  '__generated__/externals/ant-computer-use-mcp.js',
  `export const DEFAULT_GRANT_FLAGS = {};
export const API_RESIZE_PARAMS = {};
export function buildComputerUseTools() { return []; }
export function bindSessionContext(value) { return value ?? {}; }
export function targetImageSize() { return { width: 0, height: 0 }; }
export default {
  DEFAULT_GRANT_FLAGS,
  API_RESIZE_PARAMS,
  buildComputerUseTools,
  bindSessionContext,
  targetImageSize
};
`
);

await writeGeneratedFile(
  '__generated__/externals/ant-computer-use-mcp-sentinelApps.js',
  `export function getSentinelCategory() { return null; }
export default { getSentinelCategory };
`
);

await writeGeneratedFile(
  '__generated__/externals/ant-computer-use-mcp-types.js',
  `export const DEFAULT_GRANT_FLAGS = {};
export default { DEFAULT_GRANT_FLAGS };
`
);

for (const generatedRel of [
  '__generated__/externals/ant-computer-use-input.js',
  '__generated__/externals/ant-computer-use-swift.js'
]) {
  if (!generatedFiles.has(generatedRel)) {
    await writeGeneratedFile(generatedRel, createStubModuleSource({ defaultExport: true, names: [] }));
  }
}

for (const [targetRel, info] of unavailableExternalInfo) {
  if (generatedFiles.has(targetRel)) {
    continue;
  }
  await writeGeneratedFile(
    targetRel,
    createStubModuleSource({
      defaultExport: info.defaultExport,
      names: [...info.names]
    })
  );
}

for (const [targetRel, info] of missingModuleInfo) {
  if (generatedFiles.has(targetRel)) {
    continue;
  }
  await writeGeneratedFile(
    targetRel,
    createStubModuleSource({
      defaultExport: info.defaultExport,
      names: [...info.names]
    })
  );
}

await writeGeneratedFile(
  'cli.js',
  `#!/usr/bin/env node
import { main } from './src/main.js';

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
`
);
await fs.chmod(path.join(outDir, 'cli.js'), 0o755);

console.log(`Built ${sourceFiles.length} source files into ${path.relative(projectRoot, outDir)}.`);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function normalizeSpecifier(specifier) {
  return specifier.replace(/^src\/+/, 'src/');
}

function changeExtension(filePath, nextExtension) {
  return filePath.replace(/\.[^.\/]+$/, nextExtension);
}

function getEsbuildLoader(fileRel) {
  if (fileRel.endsWith('.tsx')) {
    return 'tsx';
  }
  if (fileRel.endsWith('.ts')) {
    return 'ts';
  }
  if (fileRel.endsWith('.jsx')) {
    return 'jsx';
  }
  return 'js';
}

function toOutputCodePath(sourceRel) {
  return changeExtension(sourceRel, '.js');
}

function toImportSpecifier(fromOutputRel, targetOutputRel) {
  const fromDir = path.posix.dirname(fromOutputRel);
  let relativePath = path.posix.relative(fromDir, targetOutputRel);
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
}

function getCandidateFiles(baseAbs, extension) {
  if (extension && rawTextExtensions.includes(extension)) {
    return [baseAbs];
  }

  const stem = extension ? baseAbs.slice(0, -extension.length) : baseAbs;
  const candidates = [];

  if (extension && codeExtensions.includes(extension)) {
    for (const codeExtension of codeExtensions) {
      candidates.push(`${stem}${codeExtension}`);
    }
    for (const codeExtension of codeExtensions) {
      candidates.push(path.join(stem, `index${codeExtension}`));
    }
    return candidates;
  }

  for (const codeExtension of codeExtensions) {
    candidates.push(`${baseAbs}${codeExtension}`);
  }
  for (const codeExtension of codeExtensions) {
    candidates.push(path.join(baseAbs, `index${codeExtension}`));
  }
  return candidates;
}

async function walkDirectory(directory) {
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
      continue;
    }
    const entryAbs = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(entryAbs)));
      continue;
    }
    if (codeExtensions.includes(path.extname(entry.name))) {
      files.push(entryAbs);
    }
  }
  return files;
}

function resolveProjectSpecifier(sourceRel, rawSpecifier) {
  const specifier = normalizeSpecifier(rawSpecifier);

  if (generatedSpecMap.has(specifier)) {
    return {
      kind: generatedSpecMap.get(specifier).startsWith('__generated__/externals/')
        ? 'unavailable-external'
        : 'mapped',
      targetRel: generatedSpecMap.get(specifier)
    };
  }

  const isAlias = specifier.startsWith('src/');
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');

  if (!isAlias && !isRelative) {
    return { kind: 'external' };
  }

  const sourceDirAbs = path.join(projectRoot, path.posix.dirname(sourceRel));
  const resolvedBaseAbs = isAlias
    ? path.join(projectRoot, specifier)
    : path.resolve(sourceDirAbs, specifier);
  const extension = path.extname(specifier);

  if (rawTextExtensions.includes(extension)) {
    const assetSourceRel = toPosix(path.relative(projectRoot, resolvedBaseAbs));
    return {
      kind: 'asset',
      assetSourceRel,
      targetRel: `${assetSourceRel}.js`
    };
  }

  const candidates = getCandidateFiles(resolvedBaseAbs, extension);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const candidateRel = toPosix(path.relative(projectRoot, candidate));
      return {
        kind: 'code',
        targetRel: toOutputCodePath(candidateRel)
      };
    }
  }

  const missingRel = toPosix(path.relative(projectRoot, extension ? changeExtension(resolvedBaseAbs, '.js') : `${resolvedBaseAbs}.js`));
  return {
    kind: 'missing',
    targetRel: missingRel
  };
}

function rewriteSourceText(sourceRel, sourceText) {
  return sourceText.replace(moduleSpecPattern, (match, q1, s1, q2, s2, q3, s3) => {
    const specifier = s1 ?? s2 ?? s3;
    const quote = q1 ?? q2 ?? q3 ?? "'";
    const resolution = resolveProjectSpecifier(sourceRel, specifier);

    if (resolution.kind === 'asset') {
      rawAssetModules.set(resolution.assetSourceRel, resolution.targetRel);
      const nextSpecifier = toImportSpecifier(toOutputCodePath(sourceRel), resolution.targetRel);
      return match.replace(`${quote}${specifier}${quote}`, `${quote}${nextSpecifier}${quote}`);
    }

    if (resolution.kind === 'code' || resolution.kind === 'missing' || resolution.kind === 'mapped' || resolution.kind === 'unavailable-external') {
      if (resolution.kind === 'missing') {
        getMissingModuleRecord(missingModuleInfo, resolution.targetRel);
      }
      if (resolution.kind === 'unavailable-external') {
        getMissingModuleRecord(unavailableExternalInfo, resolution.targetRel);
      }
      const nextSpecifier = toImportSpecifier(toOutputCodePath(sourceRel), resolution.targetRel);
      return match.replace(`${quote}${specifier}${quote}`, `${quote}${nextSpecifier}${quote}`);
    }

    return match;
  });
}

function withRequireShim(sourceText) {
  if (!/\brequire\(/.test(sourceText) || /const require = __ccCreateRequire\(import\.meta\.url\)/.test(sourceText)) {
    return sourceText;
  }

  return `import { createRequire as __ccCreateRequire } from 'node:module';\nconst require = __ccCreateRequire(import.meta.url);\n${sourceText}`;
}

function getMissingModuleRecord(map, targetRel) {
  let record = map.get(targetRel);
  if (!record) {
    record = {
      defaultExport: false,
      names: new Set()
    };
    map.set(targetRel, record);
  }
  return record;
}

function collectNamesFromClause(clause, kind) {
  const result = {
    defaultExport: false,
    names: new Set()
  };

  const trimmed = clause.trim();
  if (!trimmed || trimmed.startsWith('type ')) {
    return result;
  }

  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');

  if (kind === 'import') {
    if (braceStart === -1 && !trimmed.includes('* as')) {
      result.defaultExport = true;
      return result;
    }

    if (braceStart > 0) {
      const prefix = trimmed.slice(0, braceStart).replace(/,/g, '').trim();
      if (prefix) {
        result.defaultExport = true;
      }
    }
  }

  if (braceStart !== -1 && braceEnd > braceStart) {
    const inside = trimmed.slice(braceStart + 1, braceEnd);
    for (const part of inside.split(',')) {
      const entry = part.trim().replace(/^type\s+/, '');
      if (!entry) {
        continue;
      }
      const [sourceName] = entry.split(/\s+as\s+/);
      if (sourceName) {
        result.names.add(sourceName.trim());
      }
    }
  }

  return result;
}

function collectMissingModuleUsage(sourceRel, sourceText) {
  for (const match of sourceText.matchAll(importFromPattern)) {
    const kind = match[1];
    const clause = match[2] ?? '';
    const rawSpecifier = match[3];
    const resolution = resolveProjectSpecifier(sourceRel, rawSpecifier);
    if (resolution.kind !== 'missing' && resolution.kind !== 'unavailable-external') {
      continue;
    }

    const targetMap = resolution.kind === 'unavailable-external' ? unavailableExternalInfo : missingModuleInfo;
    const record = getMissingModuleRecord(targetMap, resolution.targetRel);
    const usage = collectNamesFromClause(clause, kind);
    if (usage.defaultExport) {
      record.defaultExport = true;
    }
    for (const name of usage.names) {
      record.names.add(name);
    }
  }

  for (const match of sourceText.matchAll(requireMemberPattern)) {
    const rawSpecifier = match[1];
    const memberName = match[2];
    const resolution = resolveProjectSpecifier(sourceRel, rawSpecifier);
    if (resolution.kind !== 'missing' && resolution.kind !== 'unavailable-external') {
      continue;
    }
    const targetMap = resolution.kind === 'unavailable-external' ? unavailableExternalInfo : missingModuleInfo;
    const record = getMissingModuleRecord(targetMap, resolution.targetRel);
    record.names.add(memberName);
  }
}

async function writeGeneratedFile(outputRel, contents) {
  const outputAbs = path.join(outDir, outputRel);
  await fs.mkdir(path.dirname(outputAbs), { recursive: true });
  await fs.writeFile(outputAbs, contents, 'utf8');
  generatedFiles.add(outputRel);
}

function createStubModuleSource({ defaultExport, names }) {
  const exportLines = [
    `function __ccPlaceholder(label) {`,
    `  const fn = function () { return __ccPlaceholder(label + '()'); };`,
    `  return new Proxy(fn, {`,
    `    get(_target, prop) {`,
    `      if (prop === 'then') return undefined;`,
    `      if (prop === Symbol.toPrimitive) return () => label;`,
    `      if (prop === 'toString') return () => label;`,
    `      if (prop === 'valueOf') return () => label;`,
    `      if (prop === Symbol.iterator) return function* () {};`,
    `      if (prop === 'length') return 0;`,
    `      return __ccPlaceholder(label + '.' + String(prop));`,
    `    },`,
    `    apply() { return __ccPlaceholder(label + '()'); },`,
    `    construct() { return __ccPlaceholder('new ' + label); }`,
    `  });`,
    `}`
  ];

  if (defaultExport) {
    exportLines.push(`export default __ccPlaceholder('default');`);
  }

  for (const name of names.sort()) {
    if (!name || name === 'default') {
      continue;
    }
    exportLines.push(`export const ${name} = __ccPlaceholder(${JSON.stringify(name)});`);
  }

  if (!defaultExport && names.length === 0) {
    exportLines.push(`export default __ccPlaceholder('default');`);
  }

  return `${exportLines.join('\n')}\n`;
}
