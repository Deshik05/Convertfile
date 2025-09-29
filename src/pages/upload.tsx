import { Elysia, t } from "elysia";
import db from "../db/db";
import { uploadsDir } from "../index";
import { userService } from "./user";
import path from "path";
import { HTTP_ALLOWED, WEBROOT } from "../helpers/env";
import { metrics, recordRequest, recordCompletion, recordError, getServerMAC, cleanIP, getClientIP } from "../helpers/metrics";

export const upload = new Elysia()
  .use(userService)
  .post(
    "/upload",
    async ({ body, jwt, cookie: { auth, jobId }, request, server }) => {
      const requestReceived = Date.now();

      // --- Auth check ---
      if (!auth?.value) {
        recordError();
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const user = await jwt.verify(auth.value);
      if (!user) {
        recordError();
        return new Response(JSON.stringify({ error: "Invalid user" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      // --- JobId check from cookie ---
      if (!jobId?.value) {
        const { id } = db
          .query("SELECT id FROM jobs WHERE user_id = ? ORDER BY id DESC")
          .get(user.id) as { id: string };

        if (!id) {
          recordError();
          return new Response(JSON.stringify({ error: "Cookies should be enabled" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        jobId.set({
          value: id,
          httpOnly: true,
          secure: !HTTP_ALLOWED,
          maxAge: 24 * 60 * 60,
          sameSite: "strict",
        });
      }

      if (!jobId.value) {
        recordError();
        return new Response(JSON.stringify({ error: "Job ID missing" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const existingJob = await db
        .query("SELECT * FROM jobs WHERE id = ? AND user_id = ?")
        .get(jobId.value, user.id);

      if (!existingJob) {
        recordError();
        return new Response(JSON.stringify({ error: "Invalid job" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // --- IP detection consistent with convert API ---
      let ip = "127.0.0.1";
      try {
        const ip1 = getClientIP(request);
        const serverIPInfo = (server as any)?.requestIP?.(request);
        const ip2 = cleanIP(serverIPInfo);
        const connectionIP = (request as any).connection?.remoteAddress || (request as any).socket?.remoteAddress;
        const ip3 = cleanIP(connectionIP);
        const rawHeaders = (request as any).headers || {};
        const forwardedIP = rawHeaders["x-forwarded-for"]?.split(",")[0]?.trim() ||
                            rawHeaders["x-real-ip"] ||
                            rawHeaders["cf-connecting-ip"] ||
                            rawHeaders["true-client-ip"];
        const ip4 = cleanIP(forwardedIP) || "127.0.0.1";

        ip = [ip1, ip2, ip3, ip4].find(candidate =>
          candidate && candidate !== "127.0.0.1" && candidate !== "::1" && candidate !== "localhost" && candidate.trim() !== ""
        ) || ip1;

      } catch (err) {
        console.error("Error detecting IP in upload:", err);
        ip = "127.0.0.1";
      }

      // --- Track request metrics ---
      recordRequest(String(user.id), ip);

      // --- File saving ---
      const userUploadsDir = `${uploadsDir}${user.id}/${jobId.value}/`;
      let totalBytes = 0;

      try {
        if (body?.file) {
          if (Array.isArray(body.file)) {
            for (const file of body.file) {
              await Bun.write(`${userUploadsDir}${file.name}`, file);
              totalBytes += file.size ?? 0;
            }
          } else {
            await Bun.write(`${userUploadsDir}${body.file["name"]}`, body.file);
            totalBytes += body.file.size ?? 0;
          }
        }
      } catch (err) {
        console.error("Upload error:", err);
        recordError();
        return new Response(JSON.stringify({ error: "Failed to save files" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      // --- Record completion metrics consistent with convert API ---
      const elapsed = Date.now() - requestReceived;
      recordCompletion(elapsed, {
        jobId: jobId.value,
        queueTime: 0, // upload is immediate
        convertTime: elapsed,
        bandwidth: totalBytes,
        time: Date.now(),
        mac: getServerMAC(),
      });

      console.log(`✅ Files uploaded successfully for jobId ${jobId.value} by user ${user.id} (IP: ${ip})`);

      return new Response(
        JSON.stringify({
          message: "Files uploaded successfully.",
          jobId: jobId.value,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    },
    {
      body: t.Object({ file: t.Files() }),
    }
  );
