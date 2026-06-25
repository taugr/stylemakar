import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
);
const productName = 'StyleMakar';
const version = packageJson.version;
const platformArch = arch() === 'arm64' ? 'aarch64' : arch();
const appPath = join(
  root,
  'src-tauri',
  'target',
  'release',
  'bundle',
  'macos',
  `${productName}.app`,
);
const dmgDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'dmg');
const stagingDir = join(dmgDir, `${productName}.dmgroot`);
const dmgPath = join(dmgDir, `${productName}_${version}_${platformArch}.dmg`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (platform() !== 'darwin') {
  console.error('desktop:bundle:mac can only create a DMG on macOS.');
  process.exit(1);
}

run('pnpm', ['tauri', 'build', '--bundles', 'app']);
run('codesign', ['--force', '--deep', '--sign', '-', appPath]);
run('codesign', ['--verify', '--deep', '--verbose=2', appPath]);

rmSync(stagingDir, { force: true, recursive: true });
mkdirSync(stagingDir, { recursive: true });
cpSync(appPath, join(stagingDir, `${productName}.app`), { recursive: true });
symlinkSync('/Applications', join(stagingDir, 'Applications'));

mkdirSync(dmgDir, { recursive: true });
rmSync(dmgPath, { force: true });
run('hdiutil', [
  'create',
  '-volname',
  productName,
  '-srcfolder',
  stagingDir,
  '-ov',
  '-format',
  'UDZO',
  dmgPath,
]);
rmSync(stagingDir, { force: true, recursive: true });

console.log(`Created unsigned prototype DMG: ${dmgPath}`);
