import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MODULE = path.resolve(HERE, '..', 'scripts', 'journal-action.js')
const context = { window: {} }
vm.runInNewContext(fs.readFileSync(MODULE, 'utf8'), context)
const journalAction = context.window.FeisiJournalAction
const API_MODULE = path.resolve(HERE, '..', 'scripts', 'api.js')

test('收束卡把多行行动合成一句，时间和完成条件保持完整', () => {
  const content = journalAction.composeClosingJournal({
    status: '临近考试时睡不着',
    ideal: '',
    resources: '',
    action: '先把手机放到桌上\n再写下明天第一件事',
    when: '今天 22:30',
    condition: '两件事都做完',
  })
  const parsed = journalAction.parseJournalAction(content)

  assert.equal(parsed.text, '先把手机放到桌上 再写下明天第一件事')
  assert.equal(parsed.when, '今天 22:30')
  assert.equal(parsed.condition, '两件事都做完')
})

test('旧的多行行动记录也能完整读出，而不是只取第一行', () => {
  const parsed = journalAction.parseJournalAction(
    [
      '这次谈到的事：考前焦虑',
      '我的一小步：先关掉消息提醒',
      '再整理明天要带的三样东西（今晚睡前；完成条件：都放进书包）',
    ].join('\n'),
  )

  assert.equal(parsed.text, '先关掉消息提醒 再整理明天要带的三样东西')
  assert.equal(parsed.when, '今晚睡前')
  assert.equal(parsed.condition, '都放进书包')
})

test('只用 ?live=1 联调时，站内链接仍保留真实数据模式', () => {
  const apiContext = {
    window: {
      location: { pathname: '/articles.html', search: '?live=1' },
      localStorage: { getItem: () => null },
      setTimeout,
      clearTimeout,
    },
    URLSearchParams,
  }
  vm.runInNewContext(fs.readFileSync(API_MODULE, 'utf8'), apiContext)

  assert.equal(
    apiContext.window.FeisiAPI.url('article-detail.html', { id: 10 }),
    'article-detail.html?live=1&id=10',
  )
})
