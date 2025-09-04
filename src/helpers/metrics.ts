// metrics.ts
import os from "os";

export const metrics = {
  totalRequests: 0,
  activeRequests: 0,
  completedRequests: 0,
  errors: 0,
  perUser: {} as Record<string, number>,
  perMinute: [] as { time: number; count: number }[],
  avgJobTime: 0,
  jobSamples: 0,
  system: {
    loadavg: [0, 0, 0],
    mem: { free: 0, total: 0 }
  }
};

export function recordRequest(userId: string) {
  metrics.totalRequests++;
  metrics.activeRequests++;
  metrics.perUser[userId] = (metrics.perUser[userId] || 0) + 1;
}

export function recordCompletion(jobTime: number) {
  metrics.activeRequests--;
  metrics.completedRequests++;
  metrics.jobSamples++;
  metrics.avgJobTime =
    (metrics.avgJobTime * (metrics.jobSamples - 1) + jobTime) /
    metrics.jobSamples;
}

export function recordError() {
  metrics.errors++;
  if (metrics.activeRequests > 0) metrics.activeRequests--;
}

export function refreshSystemStats() {
  metrics.system.loadavg = os.loadavg();
  metrics.system.mem = {
    free: os.freemem(),
    total: os.totalmem()
  };
}

// push traffic counts every minute
setInterval(() => {
  metrics.perMinute.push({ time: Date.now(), count: metrics.totalRequests });
  if (metrics.perMinute.length > 60) metrics.perMinute.shift(); // last 60 mins
  refreshSystemStats();
}, 60_000);
