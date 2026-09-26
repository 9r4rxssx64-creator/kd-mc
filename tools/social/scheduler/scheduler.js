/**
 * Content Scheduler — Smart timing, queue system, content calendar
 * Research-backed optimal posting times (2026 data)
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'tools/social/data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedules.json');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const CALENDAR_FILE = path.join(DATA_DIR, 'calendar.json');

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function loadJson(f, fb = {}) { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return fb; } }
function saveJson(f, d) { ensureDir(); fs.writeFileSync(f, JSON.stringify(d, null, 2)); }
function genId() { return `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`; }

const OPTIMAL_TIMES = {
  youtube: {
    best: [
      { day: 2, hours: [14, 15, 16] },
      { day: 4, hours: [14, 15, 16] },
      { day: 6, hours: [9, 10, 11] },
    ],
    good: [
      { day: 1, hours: [17, 18] },
      { day: 3, hours: [12, 13] },
      { day: 5, hours: [15, 16, 17] },
      { day: 0, hours: [10, 11, 12] },
    ],
  },
  tiktok: {
    best: [
      { day: 2, hours: [19, 20, 21] },
      { day: 4, hours: [19, 20, 21] },
      { day: 5, hours: [19, 20, 21] },
      { day: 0, hours: [12, 13, 14, 15] },
    ],
    good: [
      { day: 1, hours: [18, 19, 20] },
      { day: 3, hours: [19, 20] },
      { day: 6, hours: [10, 11, 18, 19] },
    ],
  },
  instagram: {
    best: [
      { day: 1, hours: [11, 12, 13] },
      { day: 3, hours: [11, 12, 13] },
      { day: 5, hours: [11, 12, 13] },
      { day: 2, hours: [14, 15] },
    ],
    good: [
      { day: 4, hours: [11, 12] },
      { day: 6, hours: [10, 11] },
      { day: 0, hours: [10, 11, 17, 18] },
    ],
  },
  facebook: {
    best: [
      { day: 3, hours: [11, 12] },
      { day: 5, hours: [10, 11] },
    ],
    good: [
      { day: 1, hours: [9, 10] },
      { day: 2, hours: [11, 12] },
      { day: 4, hours: [13, 14] },
    ],
  },
};

const NICHE_ROTATION = [
  'betrayal', 'mystery', 'finance', 'true-crime', 'motivation',
  'revenge', 'mystery', 'finance', 'betrayal', 'true-crime',
];

export function createSchedule(config) {
  const db = loadJson(SCHEDULE_FILE, { schedules: {} });
  const id = genId();
  db.schedules[id] = {
    id,
    name: config.name || 'Default Schedule',
    platforms: config.platforms || ['youtube'],
    frequency: config.frequency || 'daily',
    niche: config.niche || 'auto',
    template: config.template || 'narrative-storytelling',
    language: config.language || 'en',
    timezone: config.timezone || 'Europe/Paris',
    useOptimalTimes: config.useOptimalTimes !== false,
    randomOffset: config.randomOffset ?? 30,
    minGapHours: config.minGapHours || 4,
    active: true,
    created: new Date().toISOString(),
  };
  saveJson(SCHEDULE_FILE, db);
  return db.schedules[id];
}

export function updateSchedule(id, config) {
  const db = loadJson(SCHEDULE_FILE, { schedules: {} });
  if (!db.schedules[id]) throw new Error(`Schedule ${id} not found`);
  Object.assign(db.schedules[id], config, { updatedAt: new Date().toISOString() });
  saveJson(SCHEDULE_FILE, db);
  return db.schedules[id];
}

export function deleteSchedule(id) {
  const db = loadJson(SCHEDULE_FILE, { schedules: {} });
  delete db.schedules[id];
  saveJson(SCHEDULE_FILE, db);
}

export function listSchedules() {
  const db = loadJson(SCHEDULE_FILE, { schedules: {} });
  return Object.values(db.schedules);
}

export function getNextOptimalTime(platform, after = new Date()) {
  const slots = OPTIMAL_TIMES[platform];
  if (!slots) return new Date(after.getTime() + 3600000);
  const allSlots = [...(slots.best || []), ...(slots.good || [])];
  const candidates = [];
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const d = new Date(after.getTime() + dayOffset * 86400000);
    const dayOfWeek = d.getDay();
    for (const slot of allSlots) {
      if (slot.day === dayOfWeek) {
        for (const hour of slot.hours) {
          const candidate = new Date(d);
          candidate.setHours(hour, Math.floor(Math.random() * 30), 0, 0);
          if (candidate > after) {
            const isBest = (slots.best || []).some(s => s.day === dayOfWeek && s.hours.includes(hour));
            candidates.push({ time: candidate, priority: isBest ? 1 : 2 });
          }
        }
      }
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || a.time - b.time);
  return candidates[0]?.time || new Date(after.getTime() + 86400000);
}

export function getNextRuns(n = 10) {
  const schedules = listSchedules().filter(s => s.active);
  const runs = [];
  for (const schedule of schedules) {
    let lastTime = new Date();
    for (let i = 0; i < Math.ceil(n / schedules.length); i++) {
      for (const platform of schedule.platforms) {
        const nextTime = getNextOptimalTime(platform, lastTime);
        runs.push({ scheduleId: schedule.id, platform, time: nextTime.toISOString(),
          niche: schedule.niche, template: schedule.template });
        lastTime = new Date(nextTime.getTime() + schedule.minGapHours * 3600000);
      }
    }
  }
  runs.sort((a, b) => new Date(a.time) - new Date(b.time));
  return runs.slice(0, n);
}

// ─── Queue System ────────────────────────────────────────────────

export function enqueue(job) {
  const db = loadJson(QUEUE_FILE, { jobs: [] });
  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const entry = {
    id,
    status: 'pending',
    priority: job.priority || 'normal',
    scheduledFor: job.scheduledFor || new Date().toISOString(),
    storyId: job.storyId,
    platform: job.platform,
    template: job.template || 'narrative-storytelling',
    language: job.language || 'en',
    niche: job.niche,
    attempts: 0,
    maxAttempts: 3,
    created: new Date().toISOString(),
    result: null,
    error: null,
  };
  db.jobs.push(entry);
  saveJson(QUEUE_FILE, db);
  return entry;
}

export function getQueue(status = null) {
  const db = loadJson(QUEUE_FILE, { jobs: [] });
  if (status) return db.jobs.filter(j => j.status === status);
  return db.jobs;
}

export function getNextJob() {
  const db = loadJson(QUEUE_FILE, { jobs: [] });
  const now = new Date().toISOString();
  const ready = db.jobs
    .filter(j => j.status === 'pending' && j.scheduledFor <= now)
    .sort((a, b) => {
      const prio = { high: 0, normal: 1, low: 2 };
      return (prio[a.priority] || 1) - (prio[b.priority] || 1) || new Date(a.scheduledFor) - new Date(b.scheduledFor);
    });
  return ready[0] || null;
}

export function updateJob(jobId, updates) {
  const db = loadJson(QUEUE_FILE, { jobs: [] });
  const job = db.jobs.find(j => j.id === jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  Object.assign(job, updates);
  saveJson(QUEUE_FILE, db);
  return job;
}

export function markJobCompleted(jobId, result) {
  return updateJob(jobId, { status: 'completed', result, completedAt: new Date().toISOString() });
}

export function markJobFailed(jobId, error) {
  const db = loadJson(QUEUE_FILE, { jobs: [] });
  const job = db.jobs.find(j => j.id === jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  job.attempts++;
  if (job.attempts >= job.maxAttempts) {
    job.status = 'failed';
    job.error = error;
    job.failedAt = new Date().toISOString();
  } else {
    job.status = 'pending';
    const backoff = Math.pow(2, job.attempts) * 60000;
    job.scheduledFor = new Date(Date.now() + backoff).toISOString();
    job.lastError = error;
  }
  saveJson(QUEUE_FILE, db);
  return job;
}

export function cleanQueue(olderThanDays = 30) {
  const db = loadJson(QUEUE_FILE, { jobs: [] });
  const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
  const before = db.jobs.length;
  db.jobs = db.jobs.filter(j => j.status === 'pending' || j.created > cutoff);
  saveJson(QUEUE_FILE, db);
  return before - db.jobs.length;
}

// ─── Content Calendar ────────────────────────────────────────────

export function generateCalendar(days = 14, opts = {}) {
  const schedules = listSchedules().filter(s => s.active);
  if (schedules.length === 0) return [];
  const calendar = [];
  const usedNiches = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(Date.now() + d * 86400000);
    const dateStr = date.toISOString().slice(0, 10);
    for (const schedule of schedules) {
      if (schedule.frequency === 'daily' || (schedule.frequency === 'weekday' && date.getDay() > 0 && date.getDay() < 6)) {
        for (const platform of schedule.platforms) {
          let niche = schedule.niche;
          if (niche === 'auto') {
            const lastNiche = usedNiches[usedNiches.length - 1];
            const candidates = NICHE_ROTATION.filter(n => n !== lastNiche);
            niche = candidates[d % candidates.length];
          }
          usedNiches.push(niche);
          const time = getNextOptimalTime(platform, date);
          calendar.push({
            date: dateStr,
            dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
            platform,
            niche,
            template: schedule.template,
            language: schedule.language,
            scheduledTime: time.toISOString(),
            scheduleId: schedule.id,
          });
        }
      }
    }
  }
  const result = { generatedAt: new Date().toISOString(), days, entries: calendar };
  saveJson(CALENDAR_FILE, result);
  return result;
}

export function getCalendar() {
  return loadJson(CALENDAR_FILE, { entries: [] });
}

export function exportCalendarMarkdown(calendar) {
  const lines = [
    `# Content Calendar`,
    `> Generated: ${calendar.generatedAt || new Date().toISOString()}`,
    `> ${calendar.days || '?'} days planned`,
    '',
    `| Date | Day | Platform | Niche | Template | Time |`,
    `|------|-----|----------|-------|----------|------|`,
  ];
  for (const e of calendar.entries || []) {
    lines.push(`| ${e.date} | ${e.dayOfWeek} | ${e.platform} | ${e.niche} | ${e.template} | ${e.scheduledTime?.slice(11, 16) || '?'} |`);
  }
  return lines.join('\n');
}

export { OPTIMAL_TIMES, NICHE_ROTATION };
