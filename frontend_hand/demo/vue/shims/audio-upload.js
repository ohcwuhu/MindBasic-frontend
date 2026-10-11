/* 原组件里「录完一句 → POST /api/vc_audio_upload → 拿到 file_id → 发 vc_audio_end」这一段，
   没有后端时页内接住（返回一个成功的信封，让流程在演示模式下也能走通）。

   **接真后端时必须关掉**：真上传要打到 `/api/vc_audio_upload`，由后端把音频落盘并生成
   `uuid4().hex` 形式的 file_id。如果这里还返回假的 `demo-audio`，后端收到 `vc_audio_end`
   校验不过，就会抛 `[upload] 音频文件标识非法，请重新录制` —— 这正是这一版修掉的毛病。 */

import { isLive } from './api-client.js'

export function installAudioUploadStandIn() {
  if (isLive) return

  const original = window.fetch?.bind(window)
  if (!original) return

  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    if (url.includes('/api/vc_audio_upload')) {
      const size = init?.body instanceof FormData ? 24000 : 0
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, file_id: 'demo-audio', file_size: size }),
      })
    }
    return original(input, init)
  }
}
