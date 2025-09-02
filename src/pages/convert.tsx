import { mkdir } from "node:fs/promises";
import { Elysia, t } from "elysia";
import sanitize from "sanitize-filename";
import { outputDir, uploadsDir } from "..";
import { mainConverter } from "../converters/main";
import db from "../db/db";
import { Jobs } from "../db/types";
import { HTTP_ALLOWED, WEBROOT } from "../helpers/env";
import { normalizeFiletype, normalizeOutputFiletype } from "../helpers/normalizeFiletype";
import { userService } from "./user";

export const convert = new Elysia().use(userService).post(
  "/convert",
  async ({ body, redirect, jwt, cookie: { auth, jobId }, set }) => {
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
    if (!userWithPremium) {
      return redirect(`${WEBROOT}/login`, 302);
    }

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

    for (let i = 0; i < fileNames.length; i++) {
      fileNames[i] = sanitize(fileNames[i] || "");
    }

    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      return redirect(`${WEBROOT}/`, 302);
    }

    // ✨ Check if Tesseract and User is Not Premium
if (converterName === "tesseract" && userWithPremium.is_premium !== 1) {
  // Redirect to modal page with user's email
  const userData = db
  .query("SELECT * FROM users WHERE id = ?")
  .get(user.id);
  console.log("User is not premium and trying to use Tesseract converter.",userData);
  return redirect(`/premium-required?email=${encodeURIComponent(userData.email)}&password=${encodeURIComponent(userData.password)}&isPremium=true}`, 303);
}

if (converterName === "tableToCSV" && userWithPremium.is_premium !== 1) {
  // Redirect to modal page with user's email
  const userData = db
  .query("SELECT * FROM users WHERE id = ?")
  .get(user.id);
  console.log("User is not premium and trying to use Tesseract converter.",userData);
  return redirect(`/premium-required?email=${encodeURIComponent(userData.email)}&password=${encodeURIComponent(userData.password)}&isPremium=true}`, 303);
}




    db.query("UPDATE jobs SET num_files = ?1, status = 'pending' WHERE id = ?2").run(
      fileNames.length,
      jobId.value,
    );

    const query = db.query(
      "INSERT INTO file_names (job_id, file_name, output_file_name, status) VALUES (?1, ?2, ?3, ?4)",
    );

    Promise.all(
      fileNames.map(async (fileName) => {
        const filePath = `${userUploadsDir}${fileName}`;
        const fileTypeOrig = fileName.split(".").pop() ?? "";
        const fileType = normalizeFiletype(fileTypeOrig);
        const newFileExt = normalizeOutputFiletype(convertTo);
        const newFileName = fileName.replace(
          new RegExp(`${fileTypeOrig}(?!.*${fileTypeOrig})`),
          newFileExt,
        );
        const targetPath = `${userOutputDir}${newFileName}`;

        const result = await mainConverter(
          filePath,
          fileType,
          convertTo,
          targetPath,
          {},
          converterName,
        );

        if (jobId.value) {
          query.run(jobId.value, fileName, newFileName, result);
        }
      }),
    )
      .then(() => {
        if (jobId.value) {
          db.query("UPDATE jobs SET status = 'completed' WHERE id = ?1").run(jobId.value);
        }
      })
      .catch((error) => {
        console.error("Error in conversion process:", error);
      });

    return redirect(`${WEBROOT}/results/${jobId.value}`, 302);
  },
  {
    body: t.Object({
      convert_to: t.String(),
      file_names: t.String(),
    }),
  },
);
