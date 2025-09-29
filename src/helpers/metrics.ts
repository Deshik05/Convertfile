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
    time: number;       // ⏱️ completion timestamp
    mac?: string;       // 💻 MAC address
  }[],
  system: {
    loadavg: [0, 0, 0],
    mem: { free: 0, total: 0 }
  }
};

// ------------------- Metrics functions -------------------
export function recordRequest(userId: string, ip: string) {
  metrics.totalRequests++;
  metrics.activeRequests++;
  metrics.perUser[userId] = (metrics.perUser[userId] || 0) + 1;
  metrics.perIp[ip] = (metrics.perIp[ip] || 0) + 1;
}

export function recordCompletion(
  jobTime: number,
  details?: {
    jobId: string;
    queueTime: number;
    convertTime: number;
    bandwidth: number;
    time: number;
    mac?: string;
  }
) {
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

// ------------------- IP helper functions -------------------
export function getClientIP(request: Request): string {
  const getHeader = (name: string): string | undefined => {
    const direct = request.headers[name.toLowerCase()];
    if (direct) return direct;

    for (const [key, value] of Object.entries(request.headers)) {
      if (key.toLowerCase() === name.toLowerCase()) return Array.isArray(value) ? value[0] : value;
    }
    return undefined;
  };

  const forwardedFor = getHeader("x-forwarded-for");
  const realIp = getHeader("x-real-ip");
  const cfIp = getHeader("cf-connecting-ip");
  const akamaiIp = getHeader("true-client-ip");
  const remoteAddr = getHeader("remote-addr");

  const ip =
    (forwardedFor && forwardedFor.split(",")[0].trim()) ||
    realIp ||
    cfIp ||
    akamaiIp ||
    remoteAddr ||
    "127.0.0.1";

  return ip;
}

export function cleanIP(ipAddr: any): string {
  if (!ipAddr) return "127.0.0.1";
  if (typeof ipAddr === "string") return ipAddr.replace(/^::ffff:/, "").trim();
  if (typeof ipAddr === "object" && ipAddr.address) return ipAddr.address.replace(/^::ffff:/, "").trim();
  return "127.0.0.1";
}

export function getServerMAC(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (!net.internal && net.mac && net.mac !== "00:00:00:00:00:00") {
        return net.mac;
      }
    }
  }
  return "unknown";
}
