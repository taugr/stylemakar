import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: false,
  deps: {
    neverBundle: ['commander', 'zod'],
  },
  entry: {
    cli: 'src/cli.ts',
  },
  fixedExtension: false,
  format: 'esm',
  sourcemap: true,
  target: 'node22',
});
