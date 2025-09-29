import { mkdir, stat } from "node:fs/promises";
import { Elysia, t } from "elysia";
import sanitize from "sanitize-filename";
import { outputDir, uploadsDir } from "..";
import { mainConverter } from "../converters/main";
import db from "../db/db";
import { Jobs } from "../db/types";
import { HTTP_ALLOWED, WEBROOT } from "../helpers/env";
import { normalizeFiletype, normalizeOutputFiletype } from "../helpers/normalizeFiletype";
import { userService } from "./user";
import {
  metrics,
  recordRequest,
  recordCompletion,
  recordError
} from "../helpers/metrics";
import os from "os";

function getServerMAC(): string {
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


// ✅ Improved IP extraction with case-insensitive header lookup
function getClientIP(request: Request): string {
  // Helper to get header case-insensitively
  const getHeader = (name: string): string | undefined => {
    // Try direct access first
    const direct = request.headers[name.toLowerCase()];
    if (direct) return direct;
    
    // Fallback: iterate through all headers (case-insensitive)
    for (const [key, value] of Object.entries(request.headers)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        return Array.isArray(value) ? value[0] : value;
      }
    }
    return undefined;
  };

  const forwardedFor = getHeader("x-forwarded-for");
  const realIp = getHeader("x-real-ip");
  const cfIp = getHeader("cf-connecting-ip");
  const akamaiIp = getHeader("true-client-ip");
  const remoteAddr = getHeader("remote-addr");

  // Parse X-Forwarded-For header (comma-separated list of IPs)
  const ip =
    (forwardedFor && forwardedFor.split(",")[0].trim()) ||
    realIp ||
    cfIp ||
    akamaiIp ||
    remoteAddr ||
    "127.0.0.1"; // Default to localhost instead of "unknown"

  return ip;
}

// Helper to clean IPv6-mapped IPv4 addresses
function cleanIP(ipAddr: any): string {
  if (!ipAddr) return "127.0.0.1";
  if (typeof ipAddr === 'string') {
    return ipAddr.replace(/^::ffff:/, '').trim();
  }
  if (typeof ipAddr === 'object' && ipAddr.address) {
    return ipAddr.address.replace(/^::ffff:/, '').trim();
  }
  return "127.0.0.1";
}

export const convert = new Elysia()
  .use(userService)
  .post(
    "/convert",
    async ({ body, redirect, jwt, request, headers, cookie: { auth, jobId }, set, server }) => {
      const requestReceived = Date.now();


      // ✅ Enhanced IP detection with multiple methods
      let ip = "127.0.0.1";
      let debugInfo = {};
      
      try {
        // Method 1: Using the helper function with case-insensitive lookup
        const ip1 = getClientIP(request);

        // Method 2: Using Elysia's server context (if available)
        const serverIPInfo = (server as any)?.requestIP?.(request);
        const ip2 = cleanIP(serverIPInfo);

        // Method 3: Direct access to connection info
        const connectionIP = (request as any).connection?.remoteAddress || 
                           (request as any).socket?.remoteAddress;
        const ip3 = cleanIP(connectionIP);

        // Method 4: Check raw headers object
        const rawHeaders = (request as any).headers || {};
        const forwardedIP = rawHeaders["x-forwarded-for"]?.split(",")[0]?.trim() ||
                          rawHeaders["x-real-ip"] ||
                          rawHeaders["cf-connecting-ip"] ||
                          rawHeaders["true-client-ip"];
        const ip4 = cleanIP(forwardedIP) || "127.0.0.1";

        // Use the first valid non-localhost IP found
        const candidates = [ip1, ip2, ip3, ip4];
        ip = candidates.find(candidate => 
          candidate && 
          candidate !== "127.0.0.1" && 
          candidate !== "::1" && 
          candidate !== "localhost" &&
          candidate.trim() !== ""
        ) || ip1;

        // Store debug info
        debugInfo = {
          method1_helper: ip1,
          method2_server: serverIPInfo,
          method2_cleaned: ip2,
          method3_connection: connectionIP,
          method3_cleaned: ip3,
          method4_raw: forwardedIP,
          method4_cleaned: ip4,
          candidates: candidates,
          finalIP: ip,
          allHeaders: Object.keys(request.headers),
          headerValues: {
            "x-forwarded-for": request.headers["x-forwarded-for"],
            "x-real-ip": request.headers["x-real-ip"],
            "cf-connecting-ip": request.headers["cf-connecting-ip"],
            "true-client-ip": request.headers["true-client-ip"]
          }
        };

        console.log("IP Detection Results:", debugInfo);
        
      } catch (error) {
        console.error("Error detecting IP:", error);
        ip = "127.0.0.1";
      }

      if (!auth?.value) {
        return redirect(`${WEBROOT}/login`, 302);
      }

      const user = await jwt.verify(auth.value);
      if (!user || typeof user === "boolean") {
        return redirect(`${WEBROOT}/login`, 302);
      }

      const userRecord = db
        .query("SELECT is_premium FROM users WHERE id = ?")
        .get(user.id);

      if (!userRecord) {
        return redirect(`${WEBROOT}/login`, 302);
      }

      const userWithPremium = { ...user, is_premium: userRecord.is_premium };

      // 📊 Track request with detected IP (ensure it's a string)
      console.log(`Recording request for user ${user.id} with IP: ${ip}`);
      recordRequest(user.id, String(ip));

      try {
        if (!jobId?.value) {
          const result = db
            .query("SELECT id FROM jobs WHERE user_id = ? ORDER BY id DESC")
            .get(user.id) as { id: string } | null;

          if (!result?.id) {
            return { message: "Cookies should be enabled to use this app." };
          }

          jobId.set({
            value: result.id,
            httpOnly: true,
            secure: !HTTP_ALLOWED,
            maxAge: 24 * 60 * 60,
            sameSite: "strict",
          });
        }

        if (!jobId.value) {
          return redirect(`${WEBROOT}/`, 302);
        }

        const existingJob = db
          .query("SELECT * FROM jobs WHERE id = ? AND user_id = ?")
          .as(Jobs)
          .get(jobId.value, user.id);

        if (!existingJob) {
          return redirect(`${WEBROOT}/`, 302);
        }

        const userUploadsDir = `${uploadsDir}${user.id}/${jobId.value}/`;
        const userOutputDir = `${outputDir}${user.id}/${jobId.value}/`;

        try {
          await mkdir(userOutputDir, { recursive: true });
        } catch (error) {
          console.error(`Failed to create the output directory: ${userOutputDir}.`, error);
        }

        const convertTo = normalizeFiletype(body.convert_to.split(",")[0] ?? "");
        const converterName = body.convert_to.split(",")[1];
        const fileNames = JSON.parse(body.file_names) as string[];

        // Sanitize file names
        for (let i = 0; i < fileNames.length; i++) {
          fileNames[i] = sanitize(fileNames[i] || "");
        }

        if (!Array.isArray(fileNames) || fileNames.length === 0) {
          return redirect(`${WEBROOT}/`, 302);
        }

        // Premium feature check
        if (
          (converterName === "tesseract" || converterName === "tableToCSV") &&
          userWithPremium.is_premium !== 1
        ) {
          const userData = db.query("SELECT * FROM users WHERE id = ?").get(user.id) as any;
          return redirect(
            `/premium-required?email=${encodeURIComponent(userData.email)}&isPremium=false`,
            303
          );
        }

        // Update job status
        db.query("UPDATE jobs SET num_files = ?1, status = 'pending' WHERE id = ?2").run(
          fileNames.length,
          jobId.value
        );

        const query = db.query(
          "INSERT INTO file_names (job_id, file_name, output_file_name, status) VALUES (?1, ?2, ?3, ?4)"
        );

        let totalInputBytes = 0;
        let totalOutputBytes = 0;
        let queueTime = 0;
        let convertTime = 0;

        // Process all files
        await Promise.all(
          fileNames.map(async (fileName) => {
            const filePath = `${userUploadsDir}${fileName}`;
            const fileTypeOrig = fileName.split(".").pop() ?? "";
            const fileType = normalizeFiletype(fileTypeOrig);
            const newFileExt = normalizeOutputFiletype(convertTo);
            const newFileName = fileName.replace(
              new RegExp(`${fileTypeOrig}(?!.*${fileTypeOrig})`),
              newFileExt
            );
            const targetPath = `${userOutputDir}${newFileName}`;

            // 📏 Measure input file size
            try {
              const stats = await stat(filePath);
              totalInputBytes += stats.size;
            } catch (e) {
              console.warn(`Could not stat input file: ${filePath}`, e);
            }

            // Queue time: before hitting converter
            const queueStart = Date.now();
            queueTime += queueStart - requestReceived;

            // Measure conversion time
            const startConvert = Date.now();
            const result = await mainConverter(
              filePath,
              fileType,
              convertTo,
              targetPath,
              {},
              converterName
            );
            convertTime += Date.now() - startConvert;

            // 📏 Measure output file size
            try {
              const statsOut = await stat(targetPath);
              totalOutputBytes += statsOut.size;
            } catch (e) {
              console.warn(`Could not stat output file: ${targetPath}`, e);
            }

            // Record file conversion result
            if (jobId.value) {
              query.run(jobId.value, fileName, newFileName, result);
            }
          })
        );

        // Mark job as completed
        db.query("UPDATE jobs SET status = 'completed' WHERE id = ?1").run(jobId.value);

        // Record completion metrics
        const totalBandwidth = totalInputBytes + totalOutputBytes;
        recordCompletion(Date.now() - requestReceived, {
          jobId: jobId.value,
          queueTime,
          convertTime,
          bandwidth: totalBandwidth,
          time: Date.now(),       // ⏱️ time logging
          mac: getServerMAC()     // 💻 MAC address
        });

        return redirect(`${WEBROOT}/results/${jobId.value}`, 302);
      } catch (error) {
        console.error("Error in conversion process:", error);
        recordError();
        
        // Update job status to failed if we have a job ID
        if (jobId?.value) {
          try {
            db.query("UPDATE jobs SET status = 'failed' WHERE id = ?1").run(jobId.value);
          } catch (dbError) {
            console.error("Failed to update job status to failed:", dbError);
          }
        }
        
        return { message: "Internal Server Error" };
      }
    },
    {
      body: t.Object({
        convert_to: t.String(),
        file_names: t.String(),
      }),
    }
  );