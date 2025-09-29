import { rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import "./helpers/printVersions";
import db from "./db/db";
import { Jobs } from "./db/types";
import { AUTO_DELETE_EVERY_N_HOURS, WEBROOT } from "./helpers/env";
import { chooseConverter } from "./pages/chooseConverter";
import { convert } from "./pages/convert";
import { deleteFile } from "./pages/deleteFile";
import { download } from "./pages/download";
import { history } from "./pages/history";
import { listConverters } from "./pages/listConverters";
import { results } from "./pages/results";
import { root } from "./pages/root";
import { upload } from "./pages/upload";
import { user } from "./pages/user";
import { premiumPage } from "./pages/modal";

import { metrics } from "./helpers/metrics";
mkdir("./data", { recursive: true }).catch(console.error);

export const uploadsDir = "./data/uploads/";
export const outputDir = "./data/output/";

const app = new Elysia({
  serve: {
    maxRequestBodySize: Number.MAX_SAFE_INTEGER,
  },
  prefix: WEBROOT,
})
  .use(html())
  .use(
    staticPlugin({
      assets: "public",
      prefix: "",
    }),
  )
  .use(user)
  .use(root)
  .use(upload)
  .use(history)
  .use(convert)
  .use(download)
  .use(results)
  .use(deleteFile)
  .use(listConverters)
  .use(chooseConverter)
.use(premiumPage)
  .onError(({ error }) => {
    console.error(error);
  });

if (process.env.NODE_ENV !== "production") {
  await import("./helpers/tailwind").then(async ({ generateTailwind }) => {
    const result = await generateTailwind();

    app.get("/generated.css", ({ set }) => {
      set.headers["content-type"] = "text/css";
      return result;
    });
  });
}

app.get("/metrics", () => {
  return metrics;  // return the object
});

app.get("/dashboard", () => `
<!DOCTYPE html>
<html>
<head>
  <title>Server Dashboard</title>
  <style>
    body { font-family: sans-serif; background: #f5f5f5; padding: 20px; }
    .card { background: white; padding: 20px; margin: 10px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,.2);}
    #traffic { height: 200px; width: 100%; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #eee; }
  </style>
</head>
<body>
  <h1>Server Dashboard</h1>

  <div class="card">
    <h2>Requests</h2>
    <p id="total"></p>
    <p id="active"></p>
    <p id="completed"></p>
    <p id="errors"></p>
    <p id="avgTime"></p>
  </div>

  <div class="card">
    <h2>Traffic (per minute)</h2>
    <canvas id="traffic"></canvas>
  </div>

  <div class="card">
    <h2>System</h2>
    <p id="cpu"></p>
    <p id="mem"></p>
  </div>

  <div class="card">
    <h2>Per-User Requests</h2>
    <table id="userTable">
      <thead>
        <tr><th>User</th><th>Requests</th></tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="card">
    <h2>Per-IP Requests</h2>
    <table id="ipTable">
      <thead>
        <tr><th>IP</th><th>Requests</th></tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="card">
    <h2>Recent Jobs</h2>
    <table id="jobTable">
      <thead>
        <tr>
          <th>Job ID</th>
          <th>Queue Time (ms)</th>
          <th>Convert Time (ms)</th>
          <th>Bandwidth (KB)</th>
          <th>Completed At</th>
          <th>MAC Address</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    async function refresh() {
      const res = await fetch('/metrics');
      const data = await res.json();

      document.getElementById('total').innerText = "Total: " + data.totalRequests;
      document.getElementById('active').innerText = "Active: " + data.activeRequests;
      document.getElementById('completed').innerText = "Completed: " + data.completedRequests;
      document.getElementById('errors').innerText = "Errors: " + data.errors;
      document.getElementById('avgTime').innerText = "Avg Job Time: " + data.avgJobTime.toFixed(2) + " ms";

      document.getElementById('cpu').innerText = "CPU Load: " + data.system.loadavg.join(", ");
      document.getElementById('mem').innerText = "Memory: " + (data.system.mem.free/1e6).toFixed(0) + " MB free / " + (data.system.mem.total/1e6).toFixed(0) + " MB total";

      trafficChart.data.labels = data.perMinute.map(p => new Date(p.time).toLocaleTimeString());
      trafficChart.data.datasets[0].data = data.perMinute.map(p => p.count);
      trafficChart.update();

      const tbody = document.querySelector("#userTable tbody");
      tbody.innerHTML = "";
      Object.entries(data.perUser).forEach(([user, count]) => {
        const row = document.createElement("tr");
        row.innerHTML = "<td>" + user + "</td><td>" + count + "</td>";
        tbody.appendChild(row);
      });

      const ipTbody = document.querySelector("#ipTable tbody");
      ipTbody.innerHTML = "";
      Object.entries(data.perIp).forEach(([ip, count]) => {
        const row = document.createElement("tr");
        row.innerHTML = "<td>" + ip + "</td><td>" + count + "</td>";
        ipTbody.appendChild(row);
      });

      const jobTbody = document.querySelector("#jobTable tbody");
      jobTbody.innerHTML = "";
      data.jobs.forEach(job => {
        const row = document.createElement("tr");
        row.innerHTML =
          "<td>" + job.jobId + "</td>" +
          "<td>" + job.queueTime + "</td>" +
          "<td>" + job.convertTime + "</td>" +
          "<td>" + (job.bandwidth/1024).toFixed(2) + "</td>" +
          "<td>" + new Date(job.time).toLocaleString() + "</td>" +
          "<td>" + (job.mac || "unknown") + "</td>";
        jobTbody.appendChild(row);
      });
    }

    const ctx = document.getElementById('traffic').getContext('2d');
    const trafficChart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Requests per Minute', data: [] }] }
    });

    setInterval(refresh, 5000);
    refresh();
  </script>
</body>
</html>
`);




app.listen(3000);

console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}${WEBROOT}`);

const clearJobs = () => {
  const jobs = db
    .query("SELECT * FROM jobs WHERE date_created < ?")
    .as(Jobs)
    .all(new Date(Date.now() - AUTO_DELETE_EVERY_N_HOURS * 60 * 60 * 1000).toISOString());

  for (const job of jobs) {
    // delete the directories
    rmSync(`${outputDir}${job.user_id}/${job.id}`, {
      recursive: true,
      force: true,
    });
    rmSync(`${uploadsDir}${job.user_id}/${job.id}`, {
      recursive: true,
      force: true,
    });

    // delete the job
    db.query("DELETE FROM jobs WHERE id = ?").run(job.id);
  }

  setTimeout(clearJobs, AUTO_DELETE_EVERY_N_HOURS * 60 * 60 * 1000);
};

if (AUTO_DELETE_EVERY_N_HOURS > 0) {
  clearJobs();
}
