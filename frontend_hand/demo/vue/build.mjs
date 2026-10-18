import { build } from 'vite'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { originalRoot } from './source-root.mjs'

for (const app of ['coach', 'journal']) {
  process.env.FEISI_APP = app
  await build({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)) })
}

// 素材不参与代码编译；只补齐缺失项，保留已有素材（Windows 播放中的文件可能被占用）。
const source = new URL('public/companion/', originalRoot)
const target = new URL('../assets/characters/', import.meta.url)
await mkdir(target, { recursive: true })
const existing = new Set(await readdir(target))
for (const name of await readdir(source)) {
  if (!existing.has(name)) await copyFile(new URL(name, source), new URL(name, target))
}
