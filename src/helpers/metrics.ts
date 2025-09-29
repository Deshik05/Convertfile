import os from "os";

export const metrics = {
  totalRequests: 0,
  activeRequests: 0,
  completedRequests: 0,
  errors: 0,
  perUser: {} as Record<string, number>,
  perIp: {} as Record<string, number>,
  perMinute: [] as { time: number; count: number }[],
  avgJobTime: 0,
  jobSamples: 0,
  jobs: [] as {
    jobId: string;
    queueTime: number;
    convertTime: number;
    bandwidth: number;
  }[],
  system: {
    loadavg: [0, 0, 0],
    mem: { free: 0, total: 0 }
  }
};

export function recordRequest(userId: string, ip: string) {
  metrics.totalRequests++;
  metrics.activeRequests++;
  metrics.perUser[userId] = (metrics.perUser[userId] || 0) + 1;
  metrics.perIp[ip] = (metrics.perIp[ip] || 0) + 1;
}

export function recordCompletion(jobTime: number, details?: {
  jobId: string;
  queueTime: number;
  convertTime: number;
  bandwidth: number;
}) {
  metrics.activeRequests--;
  metrics.completedRequests++;
  metrics.jobSamples++;
  metrics.avgJobTime =
    (metrics.avgJobTime * (metrics.jobSamples - 1) + jobTime) /
    metrics.jobSamples;

  if (details) {
    metrics.jobs.push(details);
    if (metrics.jobs.length > 50) metrics.jobs.shift(); // keep last 50 jobs
  }
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

setInterval(() => {
  metrics.perMinute.push({ time: Date.now(), count: metrics.totalRequests });
  if (metrics.perMinute.length > 60) metrics.perMinute.shift();
  refreshSystemStats();
}, 60_000);
