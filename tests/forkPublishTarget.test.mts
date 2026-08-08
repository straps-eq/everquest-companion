// WHERE A BUILT APP LOOKS FOR ITS NEXT VERSION — the one line in the tree that can undo the fork.
//
// `electron-builder.yml`'s `publish` block is not only a publishing target. electron-builder bakes
// it into `app-update.yml` inside the package, and electron-updater reads THAT at runtime to
// decide which GitHub repo's releases are "newer". Point it at the upstream repo and every install
// of this fork quietly updates itself into upstream's build — replacing the fork's own features
// with a binary that has never heard of them, without anybody asking for it.
//
// WHY THIS IS A TEST AND NOT JUST A COMMENT. The value arrived as `owner: jmoyers` and had to be
// changed by hand; this repo is a FORK that merges upstream regularly, and that block sits in a
// file upstream also edits. A future merge can restore the upstream owner as an ordinary
// auto-merge — no conflict, no prompt, nothing on screen — and the damage would not show up until
// a shipped install silently replaced itself. A frozen assertion is the only thing that turns that
// into a failed build instead of a surprise.
//
// If this fails after a merge: the fix is to restore `owner: straps-eq`, not to update the test.
// The only reason to edit the expectation is a deliberate change of where this fork publishes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const YML = readFileSync(join(HERE, '..', 'electron-builder.yml'), 'utf8')

/** THIS FORK. `git remote origin`. */
const FORK_OWNER = 'straps-eq'
/** `git remote upstream` — the repo this must never silently point back at. */
const UPSTREAM_OWNER = 'jmoyers'

/** The `publish:` block's own lines — indented entries up to the next top-level key. */
function publishBlock(): string[] {
  const lines = YML.split(/\r?\n/)
  const start = lines.findIndex((l) => /^publish:\s*$/.test(l))
  assert.ok(start >= 0, 'electron-builder.yml has no `publish:` block at all')
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.trim() !== '') break
    if (line.trim() !== '') out.push(line.trim())
  }
  return out
}

test('FP: the app publishes to — and therefore updates from — THIS fork', () => {
  const block = publishBlock()
  assert.ok(block.includes('provider: github'), `publish block was: ${block.join(' | ')}`)
  assert.ok(
    block.includes(`owner: ${FORK_OWNER}`),
    `publish.owner must be '${FORK_OWNER}'. If this failed right after merging upstream, the ` +
      `merge reverted it and every shipped install would update itself into upstream's build. ` +
      `Block was: ${block.join(' | ')}`
  )
  assert.ok(block.includes('repo: everquest-companion'), `publish block was: ${block.join(' | ')}`)
})

test('FP: the upstream owner appears NOWHERE in the publish block', () => {
  // Belt and braces: `owner:` could be right while a stray `url:` or a second entry points home.
  for (const line of publishBlock()) {
    assert.ok(!line.includes(UPSTREAM_OWNER), `publish block still names ${UPSTREAM_OWNER}: ${line}`)
  }
})
