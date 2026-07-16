const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/home/l2euser';
const OUTPUT = path.join(ROOT, 'dinalegw', 'profile', 'contribution-graph.svg');

const commitsByDate = {};
let firstDate = null;

function walk(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.name === '.git' && entry.isDirectory()) {
        const repoDir = path.dirname(full);
        try {
          const first = execSync(
            `git -C "${repoDir}" log --reverse --format="%cd" --date="format:%Y-%m-%d"`,
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] }
          ).trim().split('\n')[0];
          if (first && (!firstDate || first < firstDate)) firstDate = first;

          const log = execSync(
            `git -C "${repoDir}" log --since="2026-01-01" --until="now" --format="%cd" --date="format:%Y-%m-%d"`,
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] }
          );
          for (const date of log.trim().split('\n')) {
            if (date) commitsByDate[date] = (commitsByDate[date] || 0) + 1;
          }
        } catch (e) {}
        return;
      }
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full);
      }
    }
  } catch (e) {}
}

walk(ROOT);

const today = new Date();
today.setHours(0, 0, 0, 0);

// Start from Feb 2026
let startDate = new Date('2026-02-01');

const totalDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;

const days = [];
let maxCount = 0;
for (let i = 0; i < totalDays; i++) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + i);
  const key = d.toISOString().split('T')[0];
  const count = commitsByDate[key] || 0;
  if (count > maxCount) maxCount = count;
  days.push({ date: d, key, count });
}

const totalContributions = Object.values(commitsByDate).reduce((a, b) => a + b, 0);

const W = 760, H = 260;
const pad = { top: 30, right: 20, bottom: 52, left: 68 };
const chartW = W - pad.left - pad.right;
const chartH = H - pad.top - pad.bottom;

const yMax = Math.max(maxCount, 5);
const yTicks = [];
const tickStep = Math.ceil(yMax / 4);
for (let i = 0; i <= 4; i++) yTicks.push(tickStep * i);

const monthLabels = [];
for (let i = 0; i < days.length; i++) {
  const d = days[i].date;
  if (d.getDate() === 1 || i === 0) {
    const m = d.toLocaleString('en', { month: 'short' });
    if (!monthLabels.length || monthLabels[monthLabels.length - 1].label !== m) {
      monthLabels.push({ index: i, label: m });
    }
  }
}

let linePath = '';
let areaPath = '';
for (let i = 0; i < days.length; i++) {
  const x = (i / (days.length - 1)) * chartW;
  const y = chartH - (days[i].count / yMax) * chartH;
  if (i === 0) {
    linePath += `M ${x} ${y}`;
    areaPath += `M ${x} ${chartH} L ${x} ${y}`;
  } else {
    linePath += ` L ${x} ${y}`;
    areaPath += ` L ${x} ${y}`;
  }
}
areaPath += ` L ${chartW} ${chartH} Z`;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#39d353" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#39d353" stop-opacity="0.02"/>
  </linearGradient>
  <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#26a641"/>
    <stop offset="50%" stop-color="#39d353"/>
    <stop offset="100%" stop-color="#39d353"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#0d1117" rx="8"/>
<g transform="translate(${pad.left},${pad.top})">
  <text x="0" y="-8" fill="#8b949e" font-size="13" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-weight="600">${totalContributions.toLocaleString()} Contributions in the Last Year</text>`;

for (const tick of yTicks) {
  const y = chartH - (tick / yMax) * chartH;
  svg += `<line x1="0" y1="${y}" x2="${chartW}" y2="${y}" stroke="#21262d" stroke-width="1"/>`;
  svg += `<text x="-8" y="${y + 4}" fill="#8b949e" font-size="10" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">${tick}</text>`;
}

for (const ml of monthLabels) {
  const x = (ml.index / (days.length - 1)) * chartW;
  svg += `<text x="${x}" y="${chartH + 16}" fill="#8b949e" font-size="10" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">${ml.label}</text>`;
}

// Y-axis label
svg += `<text x="-12" y="${chartH / 2}" fill="#8b949e" font-size="11" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" transform="rotate(-90, -12, ${chartH / 2})">Commits</text>`;

// X-axis label
svg += `<text x="${chartW / 2}" y="${chartH + 34}" fill="#8b949e" font-size="11" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">Months</text>`;

svg += `<path d="${areaPath}" fill="url(#areaGrad)"/>`;
svg += `<path d="${linePath}" fill="none" stroke="url(#lineGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

for (let i = 0; i < days.length; i++) {
  if (days[i].count > 0) {
    const x = (i / (days.length - 1)) * chartW;
    const y = chartH - (days[i].count / yMax) * chartH;
    svg += `<circle cx="${x}" cy="${y}" r="2.5" fill="#39d353" opacity="0.8"/>`;
  }
}

svg += `</g></svg>`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, svg);
console.log(`Line chart from ${startDate.toISOString().split('T')[0]} to today (${totalDays} days)`);
console.log(`Total: ${totalContributions}, Max/day: ${maxCount}`);
