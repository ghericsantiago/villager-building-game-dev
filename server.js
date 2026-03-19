const express = require('express');
const path = require('path');
// LiveReload
const livereload = require('livereload');
const connectLivereload = require('connect-livereload');

// start livereload server and watch project files
const lrserver = livereload.createServer({exts: ['html','css','js']});
lrserver.watch(path.join(__dirname, '/'));

const app = express();
const port = process.env.PORT || 3000;

// inject livereload script into served pages
app.use(connectLivereload());

app.use(express.static(path.join(__dirname, '/')));
app.listen(port, ()=>{
  console.log(`Serving http://localhost:${port} (LiveReload enabled)`);
});
