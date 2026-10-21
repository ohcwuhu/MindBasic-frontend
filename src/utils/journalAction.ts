export interface ClosingCardLike {
  status: string
  ideal: string
  resources: string
  action: string
  when: string
  condition: string
}

export interface ParsedJournalAction {
  text: string
  when: string
  condition: string
}

const ACTION_LABEL = /^\s*我的一小步[：:]/
const ANY_LABEL = /^\s*(这次谈到的事|你希望的变化|你已经有的|我的一小步)[：:]/

function oneLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/** 收束卡和成长页共用同一份正文格式，避免多行行动被截断。 */
export function composeClosingJournal(card: ClosingCardLike): string {
  const lines = [`这次谈到的事：${card.status.trim()}`]
  if (card.ideal.trim()) lines.push(`你希望的变化：${card.ideal.trim()}`)
  if (card.resources.trim()) lines.push(`你已经有的：${card.resources.trim()}`)
  lines.push(
    `我的一小步：${oneLine(card.action)}（${oneLine(card.when)}；完成条件：${oneLine(card.condition)}）`,
  )
  return lines.join('\n').slice(0, 500)
}

export function parseJournalAction(content: string): ParsedJournalAction | null {
  const lines = String(content || '').split('\n')
  const start = lines.findIndex((line) => ACTION_LABEL.test(line))
  if (start < 0) return null

  const pieces: string[] = []
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]
    if (index > start && ANY_LABEL.test(line)) break
    pieces.push(index === start ? line.replace(ACTION_LABEL, '') : line.trim())
  }

  let rest = pieces.filter(Boolean).join(' ').trim()
  let when = ''
  let condition = ''
  const metadata = rest.match(/[（(]([^）)]*)[）)]\s*$/)
  if (metadata) {
    rest = rest.slice(0, metadata.index).trim()
    metadata[1].split(/[；;]/).forEach((part) => {
      const piece = part.trim()
      if (!piece) return
      if (/^完成条件[：:]/.test(piece)) condition = piece.replace(/^完成条件[：:]\s*/, '')
      else when = piece
    })
  }

  return rest ? { text: rest, when, condition } : null
}

export function parseLatestJournalAction<T extends { content: string }>(
  items: T[],
): (ParsedJournalAction & { item: T }) | null {
  for (const item of items) {
    const action = parseJournalAction(item.content)
    if (action) return { ...action, item }
  }
  return null
}
