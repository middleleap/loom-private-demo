// Re-render dist/ from the named base package + the private scenario + ai-dlc's generator,
// following private-source/README.md exactly: extract the base commit into a FRESH directory
// (never layer onto an already-illustrated package), run the generator, copy dist/ back.
// Without --apply it renders into a temp dir and prints the diff against ./dist; with --apply
// it replaces ./dist and stamps the ai-dlc commit the generator came from into release.json.
//   node scripts/regenerate.mjs --ai-dlc <checkout> [--apply]
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const run = (cmd, args, cwd, opts = {}) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

function walk(dir, root = dir, out = []) {
  for (const n of readdirSync(dir).sort()) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p, root, out) : out.push(relative(root, p)); }
  return out;
}

export function regenerate({ root = process.cwd(), aiDlc, apply = false } = {}) {
  if (!aiDlc) throw new Error('pass --ai-dlc <checkout of middleleap/ai-dlc>');
  aiDlc = resolve(aiDlc);
  const cfg = JSON.parse(readFileSync(join(root, 'private-source/regeneration.json'), 'utf8'));
  const generator = join(aiDlc, cfg.generator);
  if (!existsSync(generator)) throw new Error(`generator not found: ${generator}`);
  const aiDlcCommit = run('git', ['rev-parse', 'HEAD'], aiDlc).trim();

  const work = mkdtempSync(join(tmpdir(), 'loom-private-demo-'));
  try {
    const base = join(work, 'base'), next = join(work, 'next');
    // git archive gives the base commit as a fresh tree with no .git and no later edits
    run('bash', ['-c', `mkdir -p "${base}" && git archive ${cfg.base_package_commit} | tar -x -C "${base}"`], root);
    run('node', [generator, base, join(root, cfg.scenario), next], root);

    // record which ai-dlc commit the generator came from, beside the generator's own sha
    const relPath = join(next, 'dist/release.json');
    const release = JSON.parse(readFileSync(relPath, 'utf8'));
    release.illustration = { ...release.illustration, ai_dlc_commit: aiDlcCommit, regenerated_at: new Date().toISOString() };
    writeFileSync(relPath, JSON.stringify(release, null, 2) + '\n');

    // diff against the current dist/, ignoring the two stamps that always move
    const cur = join(root, 'dist'), gen = join(next, 'dist');
    const files = new Set([...walk(cur), ...walk(gen)]);
    const changed = [];
    for (const f of [...files].sort()) {
      const a = join(cur, f), b = join(gen, f);
      if (!existsSync(a)) { changed.push(`+ ${f}`); continue; }
      if (!existsSync(b)) { changed.push(`- ${f}`); continue; }
      if (f === 'release.json') {
        const strip = (o) => { const x = JSON.parse(o); if (x.illustration) { delete x.illustration.regenerated_at; delete x.illustration.ai_dlc_commit; } return JSON.stringify(x); };
        if (strip(readFileSync(a, 'utf8')) !== strip(readFileSync(b, 'utf8'))) changed.push(`~ ${f}`);
        continue;
      }
      if (sha(readFileSync(a)) !== sha(readFileSync(b))) changed.push(`~ ${f}`);
    }
    if (apply) { rmSync(cur, { recursive: true, force: true }); cpSync(gen, cur, { recursive: true }); }
    return { changed, aiDlcCommit, applied: apply, generatorSha: sha(readFileSync(generator)) };
  } finally { rmSync(work, { recursive: true, force: true }); }
}

function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--ai-dlc');
  const r = regenerate({ aiDlc: i >= 0 ? argv[i + 1] : process.env.AI_DLC_CHECKOUT, apply: argv.includes('--apply') });
  process.stdout.write(`regenerate — generator from ai-dlc ${r.aiDlcCommit.slice(0, 7)} (sha256 ${r.generatorSha.slice(0, 12)}…)\n`);
  if (!r.changed.length) process.stdout.write('  dist/ unchanged apart from the regeneration stamps\n');
  else for (const c of r.changed) process.stdout.write(`  ${c}\n`);
  process.stdout.write(r.applied ? '  applied to ./dist — review, then commit\n' : '  dry run — pass --apply to replace ./dist\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) { try { process.exit(main()); } catch (e) { process.stderr.write(e.message + '\n'); process.exit(2); } }
