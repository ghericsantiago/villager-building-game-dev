const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'public');
const entriesToCopy = ['index.html', 'src', 'assets'];

function removeDir(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyEntry(entryName) {
  const sourcePath = path.join(rootDir, entryName);
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const targetPath = path.join(outputDir, entryName);
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function ensureNoJekyll() {
  const noJekyllPath = path.join(outputDir, '.nojekyll');
  fs.writeFileSync(noJekyllPath, '');
}

function main() {
  removeDir(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  for (const entryName of entriesToCopy) {
    copyEntry(entryName);
  }

  ensureNoJekyll();
  console.log(`Static site generated in ${outputDir}`);
}

main();