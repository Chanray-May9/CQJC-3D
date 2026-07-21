/**
 * Publish dist/ to the gh-pages branch.
 *
 * Uses a temporary worktree rather than switching the current branch: copying
 * build output over the working tree clobbers the source index.html, and an
 * orphan-branch checkout in place leaves the repo in a state that is awkward to
 * get out of. The worktree keeps the main checkout untouched throughout.
 *
 * The repo token here lacks the `workflow` scope, so a GitHub Actions Pages
 * workflow cannot be pushed; publishing a built branch achieves the same result
 * without needing it.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const BRANCH = 'gh-pages';

const git = (args, opts = {}) =>
  execFileSync('git', args, { stdio: 'pipe', encoding: 'utf8', ...opts }).trim();

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html missing -- run `npm run build` first');
  process.exit(1);
}

const worktree = mkdtempSync(join(tmpdir(), 'cqjc-pages-'));

try {
  // Detached orphan checkout so the branch's history never mixes with main's.
  // The branch is recreated from scratch every deploy -- it holds build output,
  // not history worth keeping, and `checkout --orphan` refuses to reuse a name
  // that already exists.
  git(['worktree', 'add', '--detach', worktree]);
  const tmpBranch = `pages-build-${Date.now()}`;
  execFileSync('git', ['checkout', '--orphan', tmpBranch], { cwd: worktree, stdio: 'pipe' });
  execFileSync('git', ['rm', '-rf', '--quiet', '.'], { cwd: worktree, stdio: 'pipe' });

  cpSync(DIST, worktree, { recursive: true });
  // Without this, Pages runs Jekyll and drops files beginning with an underscore.
  writeFileSync(join(worktree, '.nojekyll'), '');

  execFileSync('git', ['add', '-A'], { cwd: worktree, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'Deploy CQJC 3D to GitHub Pages'], {
    cwd: worktree,
    stdio: 'pipe',
  });
  // Push the detached build commit straight onto the remote branch, so the
  // local temporary branch name never matters.
  execFileSync('git', ['push', '-f', 'origin', `HEAD:refs/heads/${BRANCH}`], {
    cwd: worktree,
    stdio: 'inherit',
  });

  console.log(`\npublished dist/ to ${BRANCH}`);
  console.log('https://chanray-may9.github.io/CQJC-3D/');
} finally {
  git(['worktree', 'remove', '--force', worktree]);
  rmSync(worktree, { recursive: true, force: true });
}
