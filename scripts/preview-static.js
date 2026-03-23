const express = require('express');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 4173);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

app.use(express.static(publicDir));

app.listen(port, () => {
  console.log(`Previewing static site from ${publicDir} at http://localhost:${port}`);
});