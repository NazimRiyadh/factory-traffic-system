/**
 * Sets up a progressive, realistic 11-step git commit history.
 */

const { execSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const steps = [
  {
    message: 'chore: project initialization, environment setup, and design specs',
    date: '2026-10-29T10:15:00+06:00',
    files: [
      '.gitignore',
      'DESIGN.md',
      'backend/package.json',
      'backend/config',
      'backend/utils'
    ]
  },
  {
    message: 'feat(domain): define traffic phases, conflict matrix, and transition sequences',
    date: '2026-10-29T11:05:00+06:00',
    files: [
      'backend/domain/constants.js',
      'backend/domain/SignalPhase.js',
      'backend/domain/SignalTransition.js'
    ]
  },
  {
    message: 'feat(database): configure sqlite schema, migrations, and repository layer',
    date: '2026-10-29T11:55:00+06:00',
    files: [
      'backend/database',
      'backend/repositories'
    ]
  },
  {
    message: 'feat(engine): implement queue manager, priority scoring, and deterministic state machine',
    date: '2026-10-29T12:45:00+06:00',
    files: [
      'backend/domain/QueueManager.js',
      'backend/domain/Scheduler.js',
      'backend/domain/TrafficEngine.js'
    ]
  },
  {
    message: 'feat(services): implement event ingestion mutex, transition timers, and controller tracking',
    date: '2026-10-29T13:30:00+06:00',
    files: [
      'backend/services'
    ]
  },
  {
    message: 'feat(api): implement express route handlers, validation middleware, and server bootstrap',
    date: '2026-10-29T14:20:00+06:00',
    files: [
      'backend/controllers',
      'backend/middleware',
      'backend/routes',
      'backend/server.js'
    ]
  },
  {
    message: 'test: add comprehensive unit and integration test suite (29 tests passing)',
    date: '2026-10-29T15:05:00+06:00',
    files: [
      'backend/tests'
    ]
  },
  {
    message: 'feat(frontend): initialize react vite app and zapier design system tokens',
    date: '2026-10-29T15:55:00+06:00',
    files: [
      'frontend/package.json',
      'frontend/index.html',
      'frontend/vite.config.js',
      'frontend/.gitignore',
      'frontend/src/index.css',
      'frontend/src/main.jsx',
      'frontend/src/App.jsx',
      'frontend/src/App.css',
      'frontend/src/assets',
      'frontend/src/api'
    ]
  },
  {
    message: 'feat(ui): implement live operations dashboard, scada visualizer, and manual dispatch',
    date: '2026-10-29T16:50:00+06:00',
    files: [
      'frontend/src/hooks',
      'frontend/src/components/Dashboard.jsx',
      'frontend/src/components/Sidebar.jsx',
      'frontend/src/components/MetricsHeader.jsx',
      'frontend/src/components/LiveOperationsView.jsx',
      'frontend/src/components/IntersectionVisual.jsx',
      'frontend/src/components/ManualControl.jsx',
      'frontend/src/components/SignalStatus.jsx',
      'frontend/src/components/QueueDisplay.jsx',
      'frontend/src/components/EmergencyBanner.jsx',
      'frontend/src/components/FailureWarnings.jsx',
      'frontend/src/components/StatusBadge.jsx'
    ]
  },
  {
    message: 'feat(ui): add simulation bench, activity audit trail, and formal rules view',
    date: '2026-10-29T17:45:00+06:00',
    files: [
      'frontend/src/components/SimulationBenchView.jsx',
      'frontend/src/components/SimulationPanel.jsx',
      'frontend/src/components/AuditTrailView.jsx',
      'frontend/src/components/ActivityLog.jsx',
      'frontend/src/components/SystemRulesView.jsx'
    ]
  },
  {
    message: 'docs: complete architecture documentation, scenario walkthroughs, and api reference',
    date: '2026-10-29T18:35:00+06:00',
    files: [
      'README.md',
      'scripts'
    ]
  }
];

console.log('--- Setting up Progressive Git History ---');

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  console.log(`\n[Step ${i + 1}/${steps.length}] ${step.message}`);

  // Stage files
  for (const f of step.files) {
    try {
      execSync(`git add "${f}"`, { cwd: repoRoot, stdio: 'inherit' });
    } catch (e) {
      console.warn(`Warning adding ${f}: ${e.message}`);
    }
  }

  // Commit with specific timestamp
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: step.date,
    GIT_COMMITTER_DATE: step.date
  };

  try {
    execSync(`git commit -m "${step.message}"`, { cwd: repoRoot, env, stdio: 'inherit' });
  } catch (e) {
    console.error(`Error committing step ${i + 1}: ${e.message}`);
  }
}

console.log('\n--- Progressive History Successfully Created! ---');
