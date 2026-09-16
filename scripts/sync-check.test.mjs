// sync-check: in-sync passes; a changed scenario, a changed generator, or a touched base file
// each produce one named finding; no ai-dlc checkout is "unchecked", never "ok".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { check } from './sync-check.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sync-'));
  const aiDlc = join(root, 'ai-dlc');
  mkdirSync(join(root, 'private-source'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });
  mkdirSync(join(aiDlc, 'scripts'), { recursive: true });
  const scenario = '{"schema":"loom.private-illustration/v1"}';
  const generator = '// generator v1';
  writeFileSync(join(root, 'private-source/open-finance-illustration.json'), scenario);
  writeFileSync(join(aiDlc, 'scripts/customer-demo-illustration.mjs'), generator);
  writeFileSync(join(root, 'dist/style.css'), 'body{}');
  writeFileSync(join(root, 'private-source/regeneration.json'), JSON.stringify({
    base_package_commit: 'abc1234', scenario: 'private-source/open-finance-illustration.json',
    generator: 'scripts/customer-demo-illustration.mjs', generated_files: ['dist/release.json'],
  }));
  writeFileSync(join(root, 'dist/release.json'), JSON.stringify({
    base_package_digest: 'deadbeefdeadbeef', illustration: { scenario_sha256: sha(scenario), generator_sha256: sha(generator), recorded_evidence_unchanged: true },
  }));
  // a fake git: the base commit holds dist/style.css with the same bytes
  const git = (args) => {
    if (args[0] === 'ls-tree') return 'dist/style.css\ndist/release.json\n';
    if (args[0] === 'show') return Buffer.from('body{}');
    throw new Error('unexpected git ' + args.join(' '));
  };
  return { root, aiDlc, git, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('in sync: exit 0, no findings', () => {
  const f = fixture();
  try { const r = check({ root: f.root, aiDlc: f.aiDlc, git: f.git }); assert.deepEqual(r.findings, []); assert.equal(r.code, 0); } finally { f.cleanup(); }
});

test('a changed generator in ai-dlc is drift', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.aiDlc, 'scripts/customer-demo-illustration.mjs'), '// generator v2');
    const r = check({ root: f.root, aiDlc: f.aiDlc, git: f.git });
    assert.equal(r.code, 1); assert.match(r.findings.join('\n'), /generator drifted/);
  } finally { f.cleanup(); }
});

test('a changed scenario is drift', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'private-source/open-finance-illustration.json'), '{"changed":true}');
    const r = check({ root: f.root, aiDlc: f.aiDlc, git: f.git });
    assert.equal(r.code, 1); assert.match(r.findings.join('\n'), /scenario drifted/);
  } finally { f.cleanup(); }
});

test('a touched base file is drift', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'dist/style.css'), 'body{color:red}');
    const r = check({ root: f.root, aiDlc: f.aiDlc, git: f.git });
    assert.equal(r.code, 1); assert.match(r.findings.join('\n'), /base drifted: dist\/style\.css/);
  } finally { f.cleanup(); }
});

test('no ai-dlc checkout is unchecked (exit 2), not ok', () => {
  const f = fixture();
  try { const r = check({ root: f.root, git: f.git }); assert.equal(r.code, 2); assert.match(r.findings.join('\n'), /generator not checked/); } finally { f.cleanup(); }
});
