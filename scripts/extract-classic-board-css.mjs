import { execSync } from 'child_process';
import fs from 'fs';

function gitFile(path) {
  return execSync(`git show a716e80:${path}`, { encoding: 'utf8' });
}

function stripImports(content) {
  return content
    .replace(/@import url\('\.\.\/styles\/variables\.css'\);\s*/g, '')
    .replace(/@import url\('\.\.\/styles\/layout\.css'\);\s*/g, '')
    .replace(/@import url\('\.\.\/styles\/components\.css'\);\s*/g, '')
    .replace(/@import '\.\/styles\/variables\.css';\s*/g, '');
}

const files = [
  ['src/styles/layout.css', 'src/styles/classic/layout.css'],
  ['src/styles/components.css', 'src/styles/classic/components.css'],
  ['src/components/BottomNavigation.css', 'src/styles/classic/BottomNavigation.css'],
  ['src/styles/PostWrite.css', 'src/styles/classic/PostWrite.css'],
];

for (const [gitPath, outPath] of files) {
  fs.writeFileSync(outPath, stripImports(gitFile(gitPath)), 'utf8');
  console.log('wrote', outPath);
}
