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
svg += `<text x="-16" y="${chartH / 2}" fill="#e6edf3" font-size="12" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-weight="600" transform="rotate(-90, -16, ${chartH / 2})">Commits per Day</text>`;

// X-axis label
svg += `<text x="${chartW / 2}" y="${chartH + 34}" fill="#e6edf3" font-size="12" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-weight="600">Time (Months)</text>`;

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

const fmtDate = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const isoKey = (d) => d.toISOString().slice(0, 10);

let currentStreak = 0, currentStreakStart = '', currentStreakEnd = '';
let longestStreak = 0, longestStreakStart = '', longestStreakEnd = '';
let run = 0, runStart = '';
let firstContrib = '';
for (const day of days) {
  if (day.count > 0) {
    if (!firstContrib) firstContrib = day.key;
    if (run === 0) runStart = day.key;
    run++;
    if (run > longestStreak) {
      longestStreak = run;
      longestStreakStart = runStart;
      longestStreakEnd = day.key;
    }
  } else {
    run = 0;
  }
}
let idx = days.length - 1;
while (idx >= 0 && days[idx].count === 0) idx--;
for (; idx >= 0; idx--) {
  if (days[idx].count > 0) {
    currentStreak++;
    currentStreakStart = days[idx].key;
    if (currentStreak === 1) currentStreakEnd = currentStreakStart;
  } else break;
}

const SW = 760, SH = 240, colW = SW / 3;
const c1 = colW / 2, c2 = colW + colW / 2, c3 = 2 * colW + colW / 2;
const numY = 95, numFont = 40;
const labelY = [140, 175, 140], labelFont = 18;
const subY = [170, 205, 170], subFont = 14;
const flame = 'M 249 20.17 C 249 20.17 249.74 22.82 249.74 24.97 C 249.74 27.03 248.39 28.7 246.33 28.7 C 244.26 28.7 242.7 27.03 242.7 24.97 L 242.73 24.61 C 240.71 27.01 239.5 30.12 239.5 33.5 C 239.5 37.92 243.08 41.5 247.5 41.5 C 251.92 41.5 255.5 37.92 255.5 33.5 C 255.5 28.11 252.91 23.3 249 20.17 Z M 247.21 38.5 C 245.43 38.5 243.99 37.1 243.99 35.36 C 243.99 33.74 245.04 32.6 246.8 32.24 C 248.57 31.88 250.4 31.03 251.42 29.66 C 251.81 30.95 252.01 32.31 252.01 33.7 C 252.01 36.35 249.86 38.5 247.21 38.5 Z';
const stats = [
  { cx: c1, val: totalContributions.toLocaleString(), label: 'Total Contributions', sub: firstContrib ? `${fmtDate(firstContrib)} - Present` : '' },
  { cx: c2, val: currentStreak.toLocaleString(), label: 'Current Streak', sub: currentStreakStart ? fmtDate(currentStreakStart) : 'No contributions yet' },
  { cx: c3, val: longestStreak.toLocaleString(), label: 'Longest Streak', sub: longestStreakStart ? `${fmtDate(longestStreakStart)} - ${fmtDate(longestStreakEnd)}` : 'No contributions yet' }
];
let svg2 = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}">
<rect width="${SW}" height="${SH}" fill="#0d1117" rx="8"/>
<line x1="${colW}" y1="25" x2="${colW}" y2="205" stroke="#30363d" stroke-width="2"/>
<line x1="${2*colW}" y1="25" x2="${2*colW}" y2="205" stroke="#30363d" stroke-width="2"/>
<circle cx="${c2}" cy="${numY}" r="55" fill="none" stroke="#39d353" stroke-width="5"/>
<path d="${flame}" transform="translate(8.75,-12.5) scale(1.5)" fill="#f78166"/>`;
for (let i = 0; i < stats.length; i++) {
  const b = stats[i];
  svg2 += `
<text x="${b.cx}" y="${numY}" fill="#39d353" font-size="${numFont}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-weight="700">${b.val}</text>
<text x="${b.cx}" y="${labelY[i]}" fill="#8b949e" font-size="${labelFont}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">${b.label}</text>
<text x="${b.cx}" y="${subY[i]}" fill="#8b949e" font-size="${subFont}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">${b.sub}</text>`;
}
svg2 += `
<text x="${SW/2}" y="${SH-12}" fill="#e6edf3" font-size="13" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">Contributions measured in UTC</text>
</svg>`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, svg);
fs.writeFileSync(path.join(ROOT, 'dinalegw', 'profile', 'streak-stats.svg'), svg2);
console.log(`Line chart from ${startDate.toISOString().split('T')[0]} to today (${totalDays} days)`);
console.log(`Total: ${totalContributions}, Max/day: ${maxCount}`);
console.log(`Current streak: ${currentStreak}, Longest streak: ${longestStreak}`);
