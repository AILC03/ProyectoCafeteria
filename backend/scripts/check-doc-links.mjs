import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import console from 'node:console';
import process from 'node:process';
function markdown(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? markdown(join(path, entry.name))
      : entry.name.endsWith('.md')
        ? [join(path, entry.name)]
        : [],
  );
}
const files = [
  ...markdown('docs'),
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'RUTA_DESARROLLO_BACKEND_ACTUAL.md',
];
let checked = 0,
  failed = 0;
for (const file of files) {
  for (const match of readFileSync(file, 'utf8').matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].split('#')[0].trim();
    if (!link || /^[a-z]+:|^<|^\//i.test(link)) continue;
    checked++;
    if (!existsSync(resolve(dirname(file), decodeURIComponent(link)))) {
      console.error(`${file}: enlace inexistente ${link}`);
      failed++;
    }
  }
}
console.info(
  `${checked} enlaces locales revisados; ${failed} inexistentes (fragmentos no comprobados).`,
);
if (failed) process.exitCode = 1;
