const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/home/l2euser';
const OUTPUT = path.join(ROOT, 'dinalegw', 'profile', 'contribution-graph.svg');
const NUM_DAYS = 365;

const CELL = 11, GAP = 3, STEP = CELL + GAP, LEFT = 44, TOP = 36, ROWS = 7, PAD = 16;

// Collect commit dates from all git repos
const commitsByDate = {};

function walk(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.name === '.git' && entry.isDirectory()) {
        const repoDir = path.dirname(full);
        try {
          const log = execSync(
            `git -C "${repoDir}" log --since="${NUM_DAYS} days ago" --until="now" --format="%cd" --date="format:%Y-%m-%d"`,
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] }
          );
          for (const date of log.trim().split('\n')) {
            if (date) commitsByDate[date] = (commitsByDate[date] || 0) + 1;
          }
        } catch (e) {
          // skip repos with errors
        }
        return; // don't recurse into .git
      }
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full);
      }
    }
  } catch (e) {
    // skip inaccessible directories
  }
}

walk(ROOT);

// Build the weeks array (53 weeks x 7 days)
const today = new Date();
today.setHours(0, 0, 0, 0);
const startDate = new Date(today);
startDate.setDate(startDate.getDate() - NUM_DAYS + 1);

// Fill in days with contributions
const dayData = {};
for (let i = 0; i < NUM_DAYS; i++) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + i);
  const key = d.toISOString().split('T')[0];
  dayData[key] = { count: commitsByDate[key] || 0, date: key };
}

// Group into weeks (Sun-Sat, starting from the first Sunday >= startDate)
const weeks = [];
let cursor = new Date(startDate);
// Adjust to the nearest previous Sunday
cursor.setDate(cursor.getDate() - cursor.getDay());

while (cursor <= today) {
  const weekDays = [];
  for (let wd = 0; wd < 7; wd++) {
    const d = new Date(cursor);
    d.setDate(d.getDate() + wd);
    const key = d.toISOString().split('T')[0];
    const count = commitsByDate[key] || 0;
    const weekday = d.getDay(); // 0=Sun, 6=Sat
    const color = count === 0 ? '#161b22'
      : count <= 2 ? '#0e4429'
      : count <= 5 ? '#006d32'
      : count <= 10 ? '#26a641'
      : '#39d353';
    weekDays.push({ contributionCount: count, date: key, color, weekday });
  }
  weeks.push({ contributionDays: weekDays });
  cursor.setDate(cursor.getDate() + 7);
}

const cols = weeks.length;

// Compute total
const totalContributions = Object.values(commitsByDate).reduce((a, b) => a + b, 0);

// Month labels
const months = [];
for (let c = 0; c < cols; c++) {
  for (const day of weeks[c].contributionDays) {
    const d = new Date(day.date);
    if (d.getDate() === 1) {
      const m = d.toLocaleString('en', { month: 'short' });
      if (!months.length || months[months.length - 1].label !== m) months.push({ col: c, label: m });
      break;
    }
  }
}

// Day label rows: Mon(1), Wed(3), Fri(5)
const dayRows = [
  { w: 1, l: 'Mon' }, { w: 3, l: 'Wed' }, { w: 5, l: 'Fri' }
];

const W = LEFT + cols * STEP + PAD;
const H = TOP + ROWS * STEP + 28;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#0d1117" rx="6"/>
<g transform="translate(${LEFT},${TOP})">
  <text x="0" y="-12" fill="#8b949e" font-size="12" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">${totalContributions.toLocaleString()} contributions in the last year</text>`;

for (const m of months) svg += `<text x="${m.col * STEP}" y="-2" fill="#8b949e" font-size="10" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">${m.label}</text>`;

for (const dl of dayRows) svg += `<text x="-8" y="${((dl.w + 6) % 7) * STEP + CELL - 2}" fill="#8b949e" font-size="10" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">${dl.l}</text>`;

for (let c = 0; c < cols; c++) {
  for (const day of weeks[c].contributionDays) {
    const r = (day.weekday + 6) % 7;
    svg += `<rect x="${c * STEP}" y="${r * STEP}" width="${CELL}" height="${CELL}" fill="${day.contributionCount > 0 ? day.color : '#161b22'}" rx="2"/>`;
  }
}

const lColors = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
svg += `<g transform="translate(${cols * STEP - 92},${ROWS * STEP + 10})">
  <text fill="#8b949e" font-size="10" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">Less</text>`;
for (let i = 0; i < lColors.length; i++) svg += `<rect x="${36 + i * 14}" y="0" width="${CELL}" height="${CELL}" fill="${lColors[i]}" rx="2"/>`;
svg += `<text x="${36 + lColors.length * 14 + 4}" y="${CELL - 1}" fill="#8b949e" font-size="10" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">More</text>
</g></g></svg>`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, svg);
console.log(`Contribution graph generated at ${OUTPUT}`);
console.log(`Total commits in last year: ${totalContributions}`);
console.log(`Weeks: ${cols}, Repos scanned: ${Object.keys(commitsByDate).length > 0 ? 'data found' : 'no data'}`);
