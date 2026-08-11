/** 轻量 Markdown 渲染（XSS 安全：先转义全部 HTML，再应用格式规则）。 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(text: string): string {
  let out = escapeHtml(text)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, (_, label, url) => {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return out
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const parts: string[] = []
  let inCode = false
  let codeLines: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushList = () => {
    if (!list) return
    const tag = list.type === 'ul' ? 'ul' : 'ol'
    parts.push(`<${tag}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`)
    list = null
  }

  for (const raw of lines) {
    if (raw.trimStart().startsWith('```')) {
      if (!inCode) {
        flushList()
        inCode = true
        codeLines = []
        parts.push('<pre><code>')
      } else {
        inCode = false
        parts.push(escapeHtml(codeLines.join('\n')) + '</code></pre>')
      }
      continue
    }
    if (inCode) {
      codeLines.push(raw)
      continue
    }

    const trimmed = raw.trim()
    if (!trimmed) {
      flushList()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushList()
      const level = heading[1].length
      parts.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }

    const listMatch = /^\s*(?:[-*]|\d+[.)])\s+/.exec(trimmed)
    if (listMatch) {
      const type = /^\s*\d+[.)]/.test(trimmed) ? 'ol' : 'ul'
      if (!list || list.type !== type) {
        flushList()
        list = { type, items: [] }
      }
      list.items.push(inline(trimmed.replace(listMatch[0], '')))
      continue
    }

    if (trimmed.startsWith('> ')) {
      flushList()
      parts.push(`<blockquote>${inline(trimmed.slice(2))}</blockquote>`)
      continue
    }

    flushList()
    parts.push(`<p>${inline(raw)}</p>`)
  }

  if (inCode) {
    parts.push(escapeHtml(codeLines.join('\n')) + '</code></pre>')
  }
  flushList()
  return parts.join('')
}
