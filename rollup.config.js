import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { defineConfig } from 'rollup'
import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import esbuild from 'rollup-plugin-esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const YuDir = path.resolve(__dirname, 'yuuki-uploader')
const sourceDir = path.resolve(YuDir, 'src')
const outDir = path.resolve(YuDir, 'dist')

const pkg = require(path.resolve(YuDir, 'package.json'))

const readme = path.resolve(__dirname, 'README.md') //自动维护重复的readme
fs.copyFileSync(readme, path.resolve(YuDir, 'README.md'))

export default defineConfig({
  input: path.resolve(sourceDir, 'index.ts'),
  output: {
    file: path.resolve(outDir, 'yuuki-uploader.js'),
    format: 'es'
  },
  plugins: [nodeResolve(), commonjs(), json(), esbuild()],
  external: [...Object.keys(pkg.dependencies)]
})
