#!/usr/bin/env node
/**
 * Cron Runner — Standalone script for scheduled execution
 * Designed for: cron, systemd timers, GitHub Actions, PM2
 *
 * Usage:
 *   node cron-runner.js              # Process next pending job
 *   node cron-runner.js --all        # Process all pending jobs
 *   node cron-runner.js --calendar   # Generate 14-day calendar + enqueue
 *   node cron-runner.js --status     # Show queue status
 */
import { getNextJob, markJobCompleted, markJobFailed, updateJob, getQueue, cleanQueue, enqueue, generateCalendar, getNextRuns } from './scheduler.js';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'tools/social/data/cron.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

async function sendTelegramNotif(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
  } catch (err) {
    log(`Telegram notification failed: ${err.message}`);
  }
}

async function processJob(job) {
  log(`Processing job ${job.id}: ${job.niche} → ${job.platform}`);
  updateJob(job.id, { status: 'generating', startedAt: new Date().toISOString() });

  try {
    const libPath = path.join(process.cwd(), 'tools/social/config/content-library.json');
    const library = JSON.parse(fs.readFileSync(libPath, 'utf-8'));

    let story = null;
    if (job.storyId) {
      story = (library.stories || []).find(s => s.id === job.storyId);
    } else {
      const candidates = (library.stories || []).filter(s =>
        !s.used && (!job.niche || s.category === job.niche || s.category?.includes(job.niche))
      );
      if (candidates.length > 0) {
        story = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    if (!story) {
      throw new Error(`No available story found for niche: ${job.niche}`);
    }

    log(`Selected story: "${story.title}" (${story.id})`);

    const templateName = job.template || 'narrative-storytelling';
    const templatePath = path.join(process.cwd(), `tools/social/templates/${templateName}.js`);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const template = await import(templatePath);
    const result = await template.generate(story, {
      format: job.platform === 'tiktok' || job.platform === 'instagram' ? 'short' : 'long',
      language: job.language || 'en',
    });

    story.used = true;
    story.lastUsedAt = new Date().toISOString();
    story.lastPlatform = job.platform;
    fs.writeFileSync(libPath, JSON.stringify(library, null, 2));

    markJobCompleted(job.id, {
      videoPath: result.videoPath,
      storyId: story.id,
      title: story.title,
      platform: job.platform,
    });

    log(`Job ${job.id} completed: ${result.videoPath}`);
    await sendTelegramNotif(`✅ <b>Video generated</b>\n📹 ${story.title}\n🎯 ${job.platform}\n📁 ${result.videoPath}`);

    return { success: true, videoPath: result.videoPath };

  } catch (err) {
    log(`Job ${job.id} failed: ${err.message}`);
    markJobFailed(job.id, err.message);
    await sendTelegramNotif(`❌ <b>Job failed</b>\n🆔 ${job.id}\n❗ ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function showStatus() {
  const queue = getQueue();
  const pending = queue.filter(j => j.status === 'pending').length;
  const generating = queue.filter(j => j.status === 'generating').length;
  const completed = queue.filter(j => j.status === 'completed').length;
  const failed = queue.filter(j => j.status === 'failed').length;

  console.log('\n📊 Queue Status:');
  console.log(`  ⏳ Pending:    ${pending}`);
  console.log(`  🔄 Generating: ${generating}`);
  console.log(`  ✅ Completed:  ${completed}`);
  console.log(`  ❌ Failed:     ${failed}`);
  console.log(`  📦 Total:      ${queue.length}`);

  const next = getNextRuns(5);
  if (next.length > 0) {
    console.log('\n📅 Next scheduled runs:');
    for (const run of next) {
      console.log(`  ${run.time.slice(0, 16)} | ${run.platform} | ${run.niche}`);
    }
  }
}

async function generateAndEnqueue() {
  const calendar = generateCalendar(14);
  log(`Calendar generated: ${calendar.entries.length} entries for 14 days`);

  let enqueued = 0;
  const existingJobs = getQueue('pending');
  for (const entry of (calendar.entries || []).slice(0, 14)) {
    const isDuplicate = existingJobs.some(j =>
      j.platform === entry.platform &&
      j.scheduledFor?.slice(0, 10) === entry.date
    );
    if (!isDuplicate) {
      enqueue({
        platform: entry.platform,
        niche: entry.niche,
        template: entry.template,
        language: entry.language,
        scheduledFor: entry.scheduledTime,
        priority: 'normal',
      });
      enqueued++;
    }
  }
  log(`Enqueued ${enqueued} new jobs`);
  console.log(`📅 Calendar: ${calendar.entries.length} entries | ${enqueued} new jobs enqueued`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    await showStatus();
    return;
  }

  if (args.includes('--calendar')) {
    await generateAndEnqueue();
    return;
  }

  if (args.includes('--clean')) {
    const removed = cleanQueue(30);
    log(`Cleaned ${removed} old jobs`);
    return;
  }

  const processAll = args.includes('--all');
  let processed = 0;

  while (true) {
    const job = getNextJob();
    if (!job) {
      if (processed === 0) log('No pending jobs');
      break;
    }
    await processJob(job);
    processed++;
    if (!processAll) break;
  }

  log(`Cron run complete: ${processed} jobs processed`);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
