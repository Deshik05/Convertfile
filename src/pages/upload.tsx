import { Elysia, t } from "elysia";
import db from "../db/db";
import { uploadsDir } from "../index";
import { userService } from "./user";
import path from "path";
import { HTTP_ALLOWED } from "../helpers/env";

export const upload = new Elysia()
  .use(userService)
  .post(
    "/upload",
    async ({ body, jwt, cookie: { auth, jobId } }) => {
      // --- Auth check ---
      if (!auth?.value) {
        return new Response(
          JSON.stringify({ error: "Not authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      const user = await jwt.verify(auth.value);
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Invalid user" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      // --- JobId check from cookie ---
      if (!jobId?.value) {
        const { id } = db
        .query("SELECT id FROM jobs WHERE user_id = ? ORDER BY id DESC")
        .get(user.id) as { id: string };
  
      if (!jobId) {
        return { message: "Cookies should be enabled to use this app." };
      }
  
      jobId.set({
        value: id,
        httpOnly: true,
        secure: !HTTP_ALLOWED,
        maxAge: 24 * 60 * 60,
        sameSite: "strict",
      });
      }

      // --- Debug logs ---
      console.log("🔍 Upload request:");
      console.log("   DB file:", path.resolve(__dirname, "../db/data.sqlite"));
      console.log("   user.id:", user.id);
      console.log("   jobId from cookie:", jobId.value);

      // --- DB check ---
      if (!jobId.value) {
        return new Response(
          JSON.stringify({ error: "Job ID is missing" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      
      const existingJob = await db
        .query("SELECT * FROM jobs WHERE id = ? AND user_id = ?")
        .get(jobId.value, user.id);

      if (!existingJob) {
        return new Response(
          JSON.stringify({ error: "Invalid job" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // --- Show all jobs for this user for debugging ---
      const allJobs = db
        .query("SELECT id, user_id FROM jobs WHERE user_id = ?")
        .all(user.id);
      console.log("   Jobs for this user:", allJobs);

      // --- File saving ---
      const userUploadsDir = `${uploadsDir}${user.id}/${jobId.value}/`;

      if (body?.file) {
        if (Array.isArray(body.file)) {
          for (const file of body.file) {
            await Bun.write(`${userUploadsDir}${file.name}`, file);
          }
        } else {
          await Bun.write(`${userUploadsDir}${body.file["name"]}`, body.file);
        }
      }

      console.log(`✅ Files uploaded successfully for jobId ${jobId.value}`);

      return new Response(
        JSON.stringify({
          message: "Files uploaded successfully.",
          jobId: jobId.value,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    },
    {
      body: t.Object({ file: t.Files() }), // jobId is only from cookie
    }
  );
