import { build } from 'vite'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { originalRoot } from './source-root.mjs'

for (const app of ['coach', 'journal', 'journalFormat']) {
  process.env.FEISI_APP = app
  await build({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)) })
}

// 素材不参与代码编译。明确列出的角色素材以源目录为准覆盖同步；若播放中的文件被占用，
// copyFile 会直接报错并停下，避免把旧素材当成新构建交付。
const source = new URL('public/companion/', originalRoot)
const target = new URL('../assets/characters/', import.meta.url)
await mkdir(target, { recursive: true })
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.isFile()) await copyFile(new URL(entry.name, source), new URL(entry.name, target))
}
