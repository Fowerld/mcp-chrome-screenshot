import { context, build } from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });
mkdirSync('dist/icons', { recursive: true });

// Copy static assets
cpSync('src/manifest.json', 'dist/manifest.json');
cpSync('src/popup.html', 'dist/popup.html');
cpSync('src/icons', 'dist/icons', { recursive: true });

const options = {
  entryPoints: ['src/background.ts', 'src/content.ts', 'src/popup.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'es2022',
  logLevel: 'info',
};

if (isWatch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(options);
}
