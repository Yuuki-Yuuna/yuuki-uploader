import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'rollup'
import dts from 'rollup-plugin-dts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const typeDir = path.resolve(__dirname, 'declarations')
const YuDir = path.resolve(__dirname, 'yuuki-uploader')
const outDir = path.resolve(YuDir, 'dist')

export default defineConfig({
  input: path.resolve(typeDir, 'index.d.ts'),
  output: {
    file: path.resolve(outDir, 'yuuki-uploader.d.ts')
  },
  plugins: [dts()]
})
