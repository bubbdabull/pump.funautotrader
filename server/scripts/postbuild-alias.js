/** Rewrite @phronis/trading imports to ../quant for runtime resolution */
const fs = require('fs')
const path = require('path')

const distDir = path.join(__dirname, '..', 'dist')

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full)
    else if (name.endsWith('.js')) patchFile(full)
  }
}

function patchFile(file) {
  let src = fs.readFileSync(file, 'utf8')
  const next = src
    .replace(/require\("\.\.\/\.\.\/dist\/quant/g, 'require("../quant')
    .replace(/require\('\.\.\/\.\.\/dist\/quant/g, "require('../quant")
  if (next !== src) fs.writeFileSync(file, next)
}

walk(distDir)
