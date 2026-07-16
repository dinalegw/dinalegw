const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/home/l2euser';
const OUTPUT = path.join(ROOT, 'dinalegw', 'profile', 'contribution-graph.svg');
const NUM_DAYS = 365;

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
const startDate = new Date(today);
startDate.setDate(startDate.getDate() - NUM_DAYS + 1);

const days = [];
let maxCount = 0;
for (let i = 0; i < NUM_DAYS; i++) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + i);
  const key = d.toISOString().split('T')[0];
  const count = commitsByDate[key] || 0;
  if (count > maxCount) maxCount = count;
  days.push({ date: d, key, count });
}

const totalContributions = Object.values(commitsByDate).reduce((a, b) => a + b, 0);

// Smooth the data with 7-day moving average for a cleaner line
function movingAverage(data, window) {
  return data.map((_, i) => {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - Math.floor(window / 2)); j < Math.min(data.length, i + Math.ceil(window / 2)); j++) {
      sum += data[j].count;
      count++;
    }
    return { ...data[i], smooth: sum / count };
  });
}
const smoothed = movingAverage(days, 7);
const smoothMax = Math.max(...smoothed.map(d => d.smooth), 1);

// Dimensions
const W = 820, H = 280;
const pad = { top: 38, right: 30, bottom: 42, left: 58 };
const cw = W - pad.left - pad.right;
const ch = H - pad.top - pad.bottom;

const yMax = Math.ceil(Math.max(maxCount, smoothMax) / 5) * 5 || 5;

// Y-axis ticks
const yTicks = [];
for (let i = 0; i <= 4; i++) yTicks.push(Math.round((yMax / 4) * i));

// Month labels
const months = [];
for (let i = 0; i < days.length; i++) {
  const d = days[i].date;
  if (d.getDate() === 1 || i === 0) {
    const m = d.toLocaleString('en', { month: 'short' });
    if (!months.length || months[months.length - 1].label !== m) months.push({ idx: i, label: m });
  }
}

// Week markers (vertical faint lines every ~4 weeks)
const weekLines = [];
for (let i = 0; i < days.length; i += 28) {
  weekLines.push(i);
}

// Build paths
let rawPath = '';
let smoothPath = '';
let areaPath = '';
for (let i = 0; i < days.length; i++) {
  const x = (i / (days.length - 1)) * cw;
  const rawY = ch - (days[i].count / yMax) * ch;
  const smoothY = ch - (smoothed[i].smooth / yMax) * ch;
  if (i === 0) {
    smoothPath += `M${x} ${smoothY}`;
    areaPath += `M${x} ${ch}L${x} ${smoothY}`;
  } else {
    smoothPath += ` L${x} ${smoothY}`;
    areaPath += ` L${x} ${smoothY}`;
  }
}
areaPath += ` L${cw} ${ch}Z`;

// Peak markers (top 3 days)
const sorted = [...days].sort((a, b) => b.count - a.count);
const peaks = sorted.slice(0, 3).filter(d => d.count > 0);

// Calculate some stats
const activeDays = days.filter(d => d.count > 0).length;
const avgPerActive = Math.round(totalContributions / (activeDays || 1));
const currentStreak = (() => {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) streak++;
    else break;
  }
  return streak;
})();
const longestStreak = (() => {
  let max = 0, cur = 0;
  for (const d of days) {
    if (d.count > 0) { cur++; if (cur > max) max = cur; }
    else cur = 0;
  }
  return max;
})();

const font = '-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif';

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#39d353" stop-opacity="0.25"/>
    <stop offset="100%" stop-color="#39d353" stop-opacity="0.02"/>
  </linearGradient>
  <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#26a641"/>
    <stop offset="30%" stop-color="#39d353"/>
    <stop offset="100%" stop-color="#39d353"/>
  </linearGradient>
  <filter id="glow">
    <feGaussianBlur stdDeviation="2" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<rect width="${W}" height="${H}" fill="#0d1117" rx="10"/>

<!-- Stats header -->
<g transform="translate(${pad.left},14)">
  <text x="0" y="0" fill="#e6edf3" font-size="20" font-family="${font}" font-weight="700">${totalContributions.toLocaleString()}</text>
  <text x="0" y="18" fill="#8b949e" font-size="11" font-family="${font}">contributions in the last year</text>
</g>

<!-- Chart area -->
<g transform="translate(${pad.left},${pad.top})">

  <!-- Vertical week lines -->
  ${weekLines.map(i => {
    const x = (i / (days.length - 1)) * cw;
    return `<line x1="${x}" y1="0" x2="${x}" y2="${ch}" stroke="#161b22" stroke-width="1"/>`;
  }).join('')}

  <!-- Y-axis grid lines & labels -->
  ${yTicks.map(t => {
    const y = ch - (t / yMax) * ch;
    return `<line x1="0" y1="${y}" x2="${cw}" y2="${y}" stroke="#21262d" stroke-width="1"/>
<text x="-10" y="${y + 4}" fill="#8b949e" font-size="10" text-anchor="end" font-family="${font}">${t}</text>`;
  }).join('')}

  <!-- X-axis line -->
  <line x1="0" y1="${ch}" x2="${cw}" y2="${ch}" stroke="#30363d" stroke-width="1"/>

  <!-- Month labels -->
  ${months.map(m => {
    const x = (m.idx / (days.length - 1)) * cw;
    return `<text x="${x}" y="${ch + 18}" fill="#8b949e" font-size="10" text-anchor="middle" font-family="${font}">${m.label}</text>`;
  }).join('')}

  <!-- Area fill under line -->
  <path d="${areaPath}" fill="url(#areaGrad)"/>

  <!-- Smooth contribution line -->
  <path d="${smoothPath}" fill="none" stroke="url(#lineGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>

  <!-- Data dots on peak days -->
  ${peaks.map(d => {
    const i = days.indexOf(d);
    const x = (i / (days.length - 1)) * cw;
    const y = ch - (d.count / yMax) * ch;
    return `<circle cx="${x}" cy="${y}" r="4" fill="#39d353" stroke="#0d1117" stroke-width="2"/>
<text x="${x}" y="${y - 10}" fill="#39d353" font-size="9" text-anchor="middle" font-family="${font}" font-weight="600">${d.count}</text>`;
  }).join('')}

</g>

<!-- Stats footer -->
<g transform="translate(${pad.left},${H - 12})">
  <rect x="0" y="-8" width="${cw}" height="1" fill="#21262d" opacity="0.5"/>
  <text x="0" y="6" fill="#8b949e" font-size="11" font-family="${font}">
    <tspan fill="#e6edf3" font-weight="600">${activeDays}</tspan> active days
  </text>
  <text x="${cw * 0.33}" y="6" fill="#8b949e" font-size="11" font-family="${font}">
    <tspan fill="#e6edf3" font-weight="600">${avgPerActive}</tspan> avg per active day
  </text>
  <text x="${cw * 0.66}" y="6" fill="#8b949e" font-size="11" font-family="${font}">
    <tspan fill="#e6edf3" font-weight="600">${longestStreak}d</tspan> longest streak
  </text>
</g>

</svg>`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, svg);
console.log(`Professional line chart generated at ${OUTPUT}`);
console.log(`Total: ${totalContributions} | Active days: ${activeDays} | Peak: ${yMax} | Longest streak: ${longestStreak}d`);
