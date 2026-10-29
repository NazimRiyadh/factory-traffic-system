/**
 * step_pusher.js
 * 
 * Allows pushing the project commit-by-commit to GitHub to simulate
 * a natural, spaced-out development workflow over time.
 * 
 * Usage:
 *   1. Set remote (if not already set):
 *      git remote add origin https://github.com/<username>/<repo>.git
 * 
 *   2. Push next step on demand:
 *      node scripts/step_pusher.js
 * 
 *   3. Auto-push with time delay (e.g., 30 minutes between commits):
 *      node scripts/step_pusher.js --auto --delay 30
 */

const { execSync } = require('child_process');
const readline = require('readline');

const args = process.argv.slice(2);
const isAuto = args.includes('--auto');
const delayIdx = args.indexOf('--delay');
const delayMinutes = delayIdx !== -1 && args[delayIdx + 1] ? parseFloat(args[delayIdx + 1]) : 30;

function run(cmd, silent = false) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: silent ? 'pipe' : 'inherit' });
  } catch (err) {
    if (silent) return null;
    throw err;
  }
}

function getRemoteUrl() {
  try {
    return execSync('git remote get-url origin', { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

function getAllCommits() {
  const output = execSync('git log --reverse --format="%H|%s"', { encoding: 'utf-8' }).trim();
  return output.split('\n').filter(Boolean).map(line => {
    const [hash, ...rest] = line.split('|');
    return { hash, message: rest.join('|') };
  });
}

function getRemoteHeadHash() {
  try {
    return execSync('git ls-remote origin refs/heads/main', { encoding: 'utf-8', stdio: 'pipe' }).trim().split('\t')[0] || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('====================================================');
  console.log('   Factory Traffic System — Step-by-Step GitHub Pusher');
  console.log('====================================================\n');

  // Check remote
  let remote = getRemoteUrl();
  if (!remote) {
    console.log('⚠️  No GitHub remote "origin" found.');
    console.log('Please add your GitHub remote first by running:');
    console.log('   git remote add origin https://github.com/<your-username>/<your-repo>.git\n');
    console.log('Or enter your GitHub repository clone URL now:');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const url = await new Promise(res => rl.question('Repository URL: ', res));
    rl.close();

    if (!url || !url.trim()) {
      console.log('No URL provided. Exiting.');
      process.exit(1);
    }

    run(`git remote add origin ${url.trim()}`);
    remote = url.trim();
    console.log(`✓ Added origin: ${remote}\n`);
  } else {
    console.log(`✓ Connected to remote: ${remote}\n`);
  }

  const allCommits = getAllCommits();
  const remoteHead = getRemoteHeadHash();

  let pushedIndex = -1;
  if (remoteHead) {
    pushedIndex = allCommits.findIndex(c => c.hash.startsWith(remoteHead) || remoteHead.startsWith(c.hash));
  }

  console.log(`Total Commits in History: ${allCommits.length}`);
  console.log(`Currently on Remote: ${pushedIndex >= 0 ? `${pushedIndex + 1}/${allCommits.length}` : '0 (Fresh Repository)'}\n`);

  console.log('--- Commit Pipeline ---');
  allCommits.forEach((c, idx) => {
    const isPushed = idx <= pushedIndex;
    const isNext = idx === pushedIndex + 1;
    const status = isPushed ? '✓ PUSHED' : isNext ? '▶ NEXT' : '  PENDING';
    console.log(`[${status}] Step ${idx + 1}/${allCommits.length}: ${c.message} (${c.hash.substring(0, 7)})`);
  });
  console.log('------------------------\n');

  if (pushedIndex >= allCommits.length - 1) {
    console.log('🎉 All commits have already been pushed to GitHub!');
    return;
  }

  const pushNextCommit = (idx) => {
    const target = allCommits[idx];
    console.log(`\n🚀 Pushing Step ${idx + 1}/${allCommits.length}...`);
    console.log(`   Message: "${target.message}"`);
    console.log(`   Target Commit: ${target.hash.substring(0, 7)}`);

    try {
      run(`git push origin ${target.hash}:refs/heads/main`);
      console.log(`✓ Step ${idx + 1} pushed successfully to GitHub!`);
      return true;
    } catch (err) {
      console.error(`❌ Push failed: ${err.message}`);
      return false;
    }
  };

  if (!isAuto) {
    const nextIdx = pushedIndex + 1;
    pushNextCommit(nextIdx);

    if (nextIdx < allCommits.length - 1) {
      console.log(`\n💡 To push the next step (${nextIdx + 2}/${allCommits.length}), wait for your desired time gap, then run:`);
      console.log('   node scripts/step_pusher.js');
      console.log('Or run in auto-mode:');
      console.log('   node scripts/step_pusher.js --auto --delay 30');
    } else {
      console.log('\n🏁 That was the final commit! Repository is fully up to date.');
    }
  } else {
    // Automated mode with delay
    console.log(`⏱️ Running in AUTOMATED MODE. Interval: ${delayMinutes} minute(s) between pushes.\n`);

    for (let i = pushedIndex + 1; i < allCommits.length; i++) {
      const success = pushNextCommit(i);
      if (!success) {
        console.log('Stopping automated runner due to push error.');
        break;
      }

      if (i < allCommits.length - 1) {
        console.log(`\n⏳ Waiting ${delayMinutes} minute(s) before pushing next step [${i + 2}/${allCommits.length}]...`);
        console.log(`   (Press Ctrl+C at any time to pause)`);
        await new Promise(res => setTimeout(res, delayMinutes * 60 * 1000));
      } else {
        console.log('\n🎉 Congratulations! All 12 commits have been pushed with realistic time spacing.');
      }
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
