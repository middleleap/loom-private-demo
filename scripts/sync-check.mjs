// Is this package still what ai-dlc main and the private scenario would generate?
// Three things can drift: the generator in ai-dlc, the scenario here, and the base package the
// illustration was layered onto. This reads dist/release.json and compares each against its
// source. Exit 0 = in sync; exit 1 = drift, one line per cause; exit 2 = cannot check.
//   node scripts/sync-check.mjs --ai-dlc <checkout of middleleap/ai-dlc>
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function check({ root = process.cwd(), aiDlc, git = defaultGit } = {}) {
  const findings = [];
  const cfgPath = join(root, 'private-source/regeneration.json');
  if (!existsSync(cfgPath)) return { findings: ['private-source/regeneration.json is missing — nothing names the base package'], code: 2 };
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const releasePath = join(root, 'dist/release.json');
  if (!existsSync(releasePath)) return { findings: ['dist/release.json is missing'], code: 2 };
  const release = JSON.parse(readFileSync(releasePath, 'utf8'));
  const ill = release.illustration || {};

  // 1. the scenario this package was rendered from is the scenario in the tree
  const scenarioPath = join(root, cfg.scenario);
  if (!existsSync(scenarioPath)) findings.push(`${cfg.scenario} is missing`);
  else if (sha(readFileSync(scenarioPath)) !== ill.scenario_sha256) findings.push(`scenario drifted: ${cfg.scenario} is not the scenario dist/ was rendered from (release.json illustration.scenario_sha256)`);

  // 2. the generator that rendered it is the generator ai-dlc main carries now
  if (!aiDlc) findings.push('generator not checked: pass --ai-dlc <checkout> (cannot verify against ai-dlc without one)');
  else {
    const gen = join(resolve(aiDlc), cfg.generator);
    if (!existsSync(gen)) findings.push(`generator missing in ai-dlc checkout: ${cfg.generator}`);
    else if (sha(readFileSync(gen)) !== ill.generator_sha256) findings.push(`generator drifted: ai-dlc ${cfg.generator} differs from the one that rendered dist/ (release.json illustration.generator_sha256) — regenerate`);
  }

  // 3. the base package under the illustration is byte-identical to the named commit
  if (ill.recorded_evidence_unchanged !== true) findings.push('release.json says recorded evidence changed — the base was not preserved');
  try {
    const listing = git(['ls-tree', '-r', '--name-only', cfg.base_package_commit, 'dist'], root).split('\n').filter(Boolean);
    const generated = new Set(cfg.generated_files);
    for (const file of listing) {
      if (generated.has(file)) continue;
      const here = join(root, file);
      if (!existsSync(here)) { findings.push(`base file missing: ${file}`); continue; }
      const theirs = git(['show', `${cfg.base_package_commit}:${file}`], root, 'buffer');
      if (sha(theirs) !== sha(readFileSync(here))) findings.push(`base drifted: ${file} differs from ${cfg.base_package_commit.slice(0, 7)}`);
    }
  } catch (e) { findings.push(`base package ${cfg.base_package_commit.slice(0, 7)} cannot be read: ${e.message.split('\n')[0]}`); }

  const code = findings.length ? (findings.every((f) => f.startsWith('generator not checked')) ? 2 : 1) : 0;
  return { findings, code, release };
}

function defaultGit(args, cwd, mode = 'utf8') {
  const out = execFileSync('git', args, { cwd, encoding: mode === 'buffer' ? 'buffer' : 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return out;
}

function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--ai-dlc');
  const aiDlc = i >= 0 ? argv[i + 1] : process.env.AI_DLC_CHECKOUT;
  const { findings, code, release } = check({ aiDlc });
  if (code === 0) {
    process.stdout.write(`sync-check — OK: dist/ is what ai-dlc's generator and the tree's scenario produce over base ${release.base_package_digest.slice(0, 12)}…\n`);
  } else {
    process.stderr.write(`sync-check — ${code === 1 ? 'DRIFT' : 'UNCHECKED'}\n`);
    for (const f of findings) process.stderr.write(`  - ${f}\n`);
    if (code === 1) process.stderr.write('  → node scripts/regenerate.mjs --ai-dlc <checkout> --apply\n');
  }
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(main());
