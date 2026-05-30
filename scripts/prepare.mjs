import { existsSync } from 'node:fs';
import process from 'node:process';
import husky from 'husky';

const skipCommands = new Set(['pack', 'publish']);

if (
  process.env.CI === 'true' ||
  skipCommands.has(process.env.npm_command ?? '') ||
  !existsSync('.git')
) {
  process.exit(0);
}

try {
  husky();
} catch (error) {
  console.warn(error instanceof Error ? error.message : String(error));
}
