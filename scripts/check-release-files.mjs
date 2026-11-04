import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = args => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], { encoding: 'utf8', windowsHide: true });
const staged = process.argv.includes('--staged');
const files = git(staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'] : ['ls-files', '-z']).split('\0').filter(Boolean);
const forbiddenPath = /(?:^|\/)(?:node_modules|data|runtime|watermarks|\.studio-runtime|\.studio-backups|\.studio-updates|\.chrome-profile|bigseller-chrome-profile)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:zip|7z|rar|log|sqlite|db)$/i;
const secret = /(?:sk-[A-Za-z0-9_-]{20,}|agt_codex_[A-Za-z0-9_.-]{15,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const problems = [];
for (const file of files) {
  if (forbiddenPath.test(file)) { problems.push(`${file}: local-only file`); continue; }
  const bytes = fs.readFileSync(path.join(root, file));
  if (bytes.length > 2 * 1024 * 1024) problems.push(`${file}: unexpected large file`);
  if (secret.test(bytes.toString('utf8'))) problems.push(`${file}: credential-like content (value suppressed)`);
}
for (const sample of ['tools/shopee_local_studio/data/runtime-config.json', 'tools/shopee_local_studio/data/tasks/example/task.json', '.studio-backups/example/program.zip', '.studio-runtime/python/python.exe', 'tools/bigseller_draft_filler/.chrome-profile/Cookies', 'watermarks/private.png', '.env']) {
  try { git(['check-ignore', '-q', sample]); } catch { problems.push(`${sample}: missing ignore rule`); }
}
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
else console.log(`Release check passed: ${files.length} ${staged ? 'staged' : 'tracked'} files; local data ignored; no matched credentials.`);
