// Bug fix: package.json's old "build" script was `echo 'Built'` — it never
// actually produced anything, yet capacitor.config.ts points webDir at "www".
// `npx cap sync` would then fail to find web assets. This script copies the
// real web app into www/ so `npm run build && npx cap sync` works.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'www');

const filesToCopy = ['index.html', 'main.js', 'styles.css', 'manifest.json', 'sw.js'];
const dirsToCopy = ['assets'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of filesToCopy) {
  const srcFile = path.join(root, file);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, path.join(out, file));
  } else {
    console.log(`Note: ${file} not found, skipping.`);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

for (const dir of dirsToCopy) {
  const srcDir = path.join(root, dir);
  if (fs.existsSync(srcDir)) {
    copyDir(srcDir, path.join(out, dir));
  } else {
    console.log(`Note: ${dir}/ not found, skipping (app will use default icons).`);
  }
}

console.log(`Built ${filesToCopy.length} files + ${dirsToCopy.join(', ')}/ into www/`);
