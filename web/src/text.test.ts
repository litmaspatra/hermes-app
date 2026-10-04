import { describe, expect, test } from 'vitest'
import { backgroundLuminance, joinHtmlBlocks, chatLinks, formatOutput, memoryDiff, mediaKind, parseCsv, plainText, prepare } from './text'

describe('prepare', () => {
  test('MEDIA line with spaces becomes an image', () => {
    expect(prepare('Here:\nMEDIA:/root/my pic.png')).toContain('![my pic.png](</root/my pic.png>)')
  })
  test('inline MEDIA file becomes a chip link, trailing punctuation kept out', () => {
    expect(prepare('see MEDIA:/root/a.pdf.')).toBe('see [📎 a.pdf](</root/a.pdf>).')
  })
  test('\\( \\) and \\[ \\] become $ and $$', () => {
    expect(prepare('a \\(x^2\\) b')).toBe('a $x^2$ b')
    expect(prepare('\\[ y \\]')).toBe('\n$$\ny\n$$\n')
  })
  test('code is left alone', () => {
    const t = '```\nMEDIA:/x.png \\(a\\)\n```'
    expect(prepare(t)).toBe(t)
    expect(prepare('`\\(a\\)`')).toBe('`\\(a\\)`')
  })
  test('math inside \\colorbox is wrapped', () => {
    expect(prepare('$\\colorbox{yellow}{\\frac{a}{b}}$')).toBe('$\\colorbox{yellow}{\\(\\displaystyle \\frac{a}{b}\\)}$')
  })
})

describe('plainText', () => {
  test('strips markdown marks, keeps link targets', () => {
    expect(plainText('# Title\n\n**bold** and _it_ and `code`\n\n[site](https://x.y)')).toBe('Title\n\nbold and it and code\n\nsite (https://x.y)')
  })
  test('code fences keep their body', () => {
    expect(plainText('```js\nlet a = 1\n```')).toBe('let a = 1')
  })
  test('MEDIA lines go', () => {
    expect(plainText('a\nMEDIA:/x.png\nb')).toBe('a\n\nb')
  })
})

describe('formatOutput', () => {
  test('JSON output + exit code', () => {
    expect(formatOutput('{"output":"hi","exit_code":0}')).toEqual({ text: 'hi', meta: 'exit 0' })
  })
  test('patch result shows its diff', () => {
    const r = formatOutput('{"success":true,"diff":"--- a\\n+++ b"}')
    expect(r.diff).toBe('--- a\n+++ b')
    expect(JSON.parse(r.text)).toEqual({ success: true })
  })
  test('plain text passes through', () => {
    expect(formatOutput('just text')).toEqual({ text: 'just text', meta: '' })
  })
})

describe('parseCsv', () => {
  test('quotes, commas, newlines, CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere']
    ])
  })
  test('TSV by the first line', () => {
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })
  test('blank rows dropped', () => {
    expect(parseCsv('a\n\n,\nb')).toEqual([['a'], ['b']])
  })
})

test('mediaKind', () => {
  expect(mediaKind('/a/b.MP4?x=1')).toBe('video')
  expect(mediaKind('data:image/png;base64,xx')).toBe('image')
  expect(mediaKind('/a/b.pdf')).toBe('file')
})

describe('chatLinks', () => {
  test('bare session id becomes a chat link', () => {
    expect(chatLinks('See 20260929_194711_8c8b2a now')).toBe('See [chat 20260929_194711_8c8b2a](hermes-chat:20260929_194711_8c8b2a) now')
  })
  test('the @session:<profile>/<id> form links as a whole', () => {
    expect(chatLinks('in @session:default/20260929_194711_8c8b2a ok')).toBe('in [chat 20260929_194711_8c8b2a](hermes-chat:20260929_194711_8c8b2a) ok')
  })
  test('ids in code, links and brackets are left alone', () => {
    const s = '`20260929_194711_8c8b2a` [x](hermes-chat:20260929_194711_8c8b2a) [20260929_194711_8c8b2a]\n```\n20260929_194711_8c8b2a\n```'
    expect(chatLinks(s)).toBe(s)
  })
})

describe('backgroundLuminance', () => {
  test('light, dark and missing backgrounds', () => {
    expect(backgroundLuminance('padding:4px;background:linear-gradient(135deg,#ede9fe,#fce7f3,#dbeafe)')!).toBeGreaterThan(0.7)
    expect(backgroundLuminance('background-color: rgb(20, 20, 30)')!).toBeLessThan(0.05)
    expect(backgroundLuminance('background:#fff')).toBe(1)
    expect(backgroundLuminance('background-color:yellow')!).toBeGreaterThan(0.8)
    expect(backgroundLuminance('color:#fff')).toBeNull()
    expect(backgroundLuminance('background: rgba(255,255,255,0.1)')).toBeNull()
  })
})

describe('display math fences', () => {
  test('$$ with content on the fence lines is split so the block closes', () => {
    expect(prepare('$$\\begin{aligned}\na &= b \\\\\n\\end{aligned}$$\n\n<div>x</div>')).toBe(
      '$$\n\\begin{aligned}\na &= b \\\\\n\\end{aligned}\n$$\n\n<div>x</div>')
    expect(prepare('> $$x\n> y$$')).toBe('> $$\n> x\n> y\n> $$')
  })
  test('one-line and well-formed blocks are untouched', () => {
    expect(prepare('$$x$$ and $$\ny\n$$')).toBe('$$x$$ and $$\ny\n$$')
    expect(prepare('$$\ny\n$$')).toBe('$$\ny\n$$')
  })
})

describe('Obsidian notes', () => {
  test('block id after a closing $$ is dropped so the formula ends', () => {
    expect(prepare('$$\nx\n$$ ^eq1\n\ntext')).toBe('$$\nx\n$$\n\ntext')
    expect(prepare('> $$ ^a-b')).toBe('> $$')
  })
  test('frontmatter, wikilinks and highlights', () => {
    expect(prepare('---\ntitle: A\ntags:\n  - x\n---\n\nSee [[Note|shown]], [[Other#Part]] ==key==')).toBe(
      '```yaml\ntitle: A\ntags:\n  - x\n```\n\nSee shown, Other › Part <mark>key</mark>'
    )
    expect(prepare('`[[a]]` and `==b==`')).toBe('`[[a]]` and `==b==`')
    expect(prepare('---\n\nhello')).toBe('---\n\nhello')
  })
})

describe('joinHtmlBlocks', () => {
  test('blank lines inside a balanced HTML block go, so indented parts stay HTML', () => {
    const t = '<div a>\n\n    <div b>x</div>\n\n</div>\n\nafter\n\n    code'
    expect(joinHtmlBlocks(t)).toBe('<div a>\n    <div b>x</div>\n</div>\n\nafter\n\n    code')
  })
  test('unbalanced or non-block text is untouched', () => {
    expect(joinHtmlBlocks('<div>\n\nopen')).toBe('<div>\n\nopen')
    expect(joinHtmlBlocks('a\n\nb')).toBe('a\n\nb')
  })
})


describe('memoryDiff', () => {
  test('replace shows the full old entry and the new one', () => {
    const d = memoryDiff(
      { target: 'user', action: 'replace', old_text: 'Replies: very', content: 'Replies: short' },
      JSON.stringify({ success: true, replaced_entry: 'Replies: very short, chatty' })
    )
    expect(d).toBe('@@ user · replace @@\n-Replies: very short, chatty\n+Replies: short')
  })
  test('batch numbers ops and uses per-op old entries', () => {
    const d = memoryDiff(
      { target: 'memory', action: 'batch', operations: [{ action: 'add', content: 'A' }, { action: 'remove', old_text: 'b' }] },
      JSON.stringify({ success: true, removed_entries: { '2': 'B full' } })
    )
    expect(d).toBe('@@ memory · 1. add @@\n+A\n@@ memory · 2. remove @@\n-B full')
  })
  test('failed or non-mutating calls give no diff', () => {
    expect(memoryDiff({ action: 'add', content: 'x' }, JSON.stringify({ success: false }))).toBeUndefined()
    expect(memoryDiff({ action: 'read' }, '')).toBeUndefined()
  })
})
