import { build } from 'vite';
import { copyFile, mkdir } from 'node:fs/promises';
await build({
  configFile: false,
  build: { target: 'chrome120', rollupOptions: { input: 'index.html' } },
});
for (const entry of ['background', 'content']) {
  await build({
    configFile: false,
    build: {
      target: 'chrome120',
      emptyOutDir: false,
      lib: {
        entry: `src/${entry}.ts`,
        formats: ['iife'],
        name: `Drama${entry}`,
        fileName: () => `${entry}.js`,
      },
    },
  });
}
await build({
  configFile: false,
  build: {
    target: 'node22',
    emptyOutDir: false,
    outDir: 'dist',
    lib: {
      entry: 'src/watch/cli.ts',
      formats: ['es'],
      fileName: () => 'watch-dramas.js',
    },
    rollupOptions: { external: [/^node:/] },
  },
});
await mkdir('dist', { recursive: true });
await copyFile('manifest.json', 'dist/manifest.json');
