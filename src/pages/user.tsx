import { randomUUID } from "node:crypto";
import { Html } from "@elysiajs/html";
import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { BaseHtml } from "../components/base";
import { Header } from "../components/header";
import db from "../db/db";
import { User } from "../db/types";
import CryptoJS from "crypto-js";
import { createCipheriv, pbkdf2Sync, randomBytes } from "crypto";
import {
  ACCOUNT_REGISTRATION,
  ALLOW_UNAUTHENTICATED,
  HIDE_HISTORY,
  HTTP_ALLOWED,
  WEBROOT,
} from "../helpers/env";

export let FIRST_RUN = db.query("SELECT * FROM users").get() === null || false;

export const userService = new Elysia({ name: "user/service" })
  .use(
    jwt({
      name: "jwt",
      schema: t.Object({
        id: t.String(),
      }),
      secret: process.env.JWT_SECRET ?? randomUUID(),
      exp: "7d",
    }),
  )
  .model({
    signIn: t.Object({
      email: t.String(),
      password: t.String(),
    }),
  })
  .macro({
    isSignIn(enabled: boolean) {
      if (!enabled) return;

      return {
        async beforeHandle({ status, jwt, cookie: { auth } }) {
          if (auth?.value) {
            const user = await jwt.verify(auth.value);
            return {
              success: true,
              user,
            };
          }

          return status(401, {
            success: false,
            message: "Unauthorized",
          });
        },
      };
    },
  });

export const user = new Elysia()
  .use(userService)
  .get("/setup", ({ redirect }) => {
    if (!FIRST_RUN) {
      return redirect(`${WEBROOT}/login`, 302);
    }

    return (
      <BaseHtml title="ConvertX | Setup" webroot={WEBROOT}>
        <main
          class={`
            mx-auto w-full max-w-4xl flex-1 px-2
            sm:px-4
          `}
        >
          <h1 class="my-8 text-3xl">Welcome to ConvertX!</h1>
          <article class="article p-0">
            <header class="w-full bg-neutral-800 p-4">Create your account</header>
            <form method="post" action={`${WEBROOT}/register`} class="p-4">
              <fieldset class="mb-4 flex flex-col gap-4">
                <label class="flex flex-col gap-1">
                  Email
                  <input
                    type="email"
                    name="email"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Email"
                    autocomplete="email"
                    required
                  />
                </label>
                <label class="flex flex-col gap-1">
                  Password
                  <input
                    type="password"
                    name="password"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Password"
                    autocomplete="current-password"
                    required
                  />
                </label>
              </fieldset>
              <input type="submit" value="Create account" class="btn-primary" />
            </form>
            <footer class="p-4">
              Report any issues on{" "}
              <a
                class={`
                  text-accent-500 underline
                  hover:text-accent-400
                `}
                href="https://github.com/C4illin/ConvertX"
              >
                GitHub
              </a>
              .
            </footer>
          </article>
        </main>
      </BaseHtml>
    );
  })


  
 .get("/register", ({ redirect }) => {
  if (!ACCOUNT_REGISTRATION) {
    return redirect(`${WEBROOT}/login`, 302);
  }

  return (
    <BaseHtml webroot={WEBROOT} title="ConvertX | Register">
      <>
        <Header
          webroot={WEBROOT}
          accountRegistration={ACCOUNT_REGISTRATION}
          allowUnauthenticated={ALLOW_UNAUTHENTICATED}
          hideHistory={HIDE_HISTORY}
        />
        <main
          class={`
            w-full flex-1 px-2
            sm:px-4
          `}
        >
          <article class="article">
            <form method="post" class="flex flex-col gap-4">
              <fieldset class="mb-4 flex flex-col gap-4">
                <label class="flex flex-col gap-1">
                  Email
                  <input
                    type="email"
                    name="email"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Email"
                    autocomplete="email"
                    required
                  />
                </label>
                <label class="flex flex-col gap-1">
                  Password
                  <input
                    type="password"
                    name="password"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Password"
                    autocomplete="current-password"
                    required
                  />
                </label>
                <label class="flex items-center gap-2">
                  <input type="checkbox" name="isPremium" value="true" />
                  Register as Premium User
                </label>
              </fieldset>
              <input type="submit" value="Register" class="w-full btn-primary" />
            </form>
          </article>
        </main>
      </>
    </BaseHtml>
  );
})


// .post(
//   "/register",
//   async ({ body, set, redirect }) => {
//     const { email, password, isPremium } = body;

//     // Prevent duplicate registration (extra guard)
//     const existingUser = db.query("SELECT * FROM users WHERE email = ?").get(email);
//     if (existingUser) {
//       set.status = 400;
//       return { message: "Email already in use." };
//     }

//     if (isPremium === "true") {
//       // Premium flow — redirect to payment gateway
//       const amount = 100;
//       const payload = {
//         email: "thabitha@gmail.com",
//         code: "thabitha@paygate",
//         amount: amount
//       };

//       const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
//       const returnUrl = `http://localhost:3000/register/premium-success?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&isPremium=true`;
//       const payUrl = `http://192.168.161.133:3000/payment/${encoded}?returnUrl=${encodeURIComponent(returnUrl)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&isPremium=true`;
//       return redirect(payUrl, 302);
//     }

//     // Non-premium user — register immediately
//     try {
//       const savedPassword = await Bun.password.hash(password);
//       db.query("INSERT INTO users (email, password, is_premium) VALUES (?, ?, 0)").run(email, savedPassword);
//     } catch (err: any) {
//       if (err.message.includes("UNIQUE constraint failed")) {
//         set.status = 400;
//         return { message: "Email already in use." };
//       }
//       throw err;
//     }

//     return redirect(`${WEBROOT}/login`, 302);
//   },
//   {
//     body: t.Object({
//       email: t.String(),
//       password: t.String(),
//       isPremium: t.Optional(t.String()),
//     }),
//   }
// )

// .get("/register/premium-success", async ({ query, redirect, set }) => {
//   try {
//     const { data } = query as { data?: string };
//     console.log("Received payment data:", data);
//     if (!data) {
//       set.status = 400;
//       return { message: "Missing payment data." };
//     }

//     // Decrypt the payment details
//     const secretKey = "12345678901234567890123456789012!"; // must match payment gateway encryption key
//     let email: string, password: string;

//     try {
//       console.log("hiii")
//       const bytes = CryptoJS.AES.decrypt(decodeURIComponent(data), secretKey);
//       const decrypted = bytes.toString(CryptoJS.enc.Utf8);

//       if (!decrypted) {
//         throw new Error("Decryption failed or returned empty string");
//       }

//       const details = JSON.parse(decrypted);
//       console.log("Decrypted payment details:", details);
//       email = details.email;
//       password = details.password;
//     } catch (err) {
//       console.error("❌ Failed to decrypt payment data", err);
//       set.status = 400;
//       return { message: "Invalid or corrupted payment data." };
//     }

//     // Prevent duplicates
//     const existingUser = db.query("SELECT * FROM users WHERE email = ?").get(email);
//     if (existingUser) {
//       return redirect(`${WEBROOT}/login`, 302);
//     }

//     // Insert premium user
//     try {
//       const savedPassword = await Bun.password.hash(password);
//       db.query("INSERT INTO users (email, password, is_premium) VALUES (?, ?, 1)").run(email, savedPassword);
//     } catch (err: any) {
//       if (err.message.includes("UNIQUE constraint failed")) {
//         return redirect(`${WEBROOT}/login`, 302);
//       }
//       throw err;
//     }

//     console.log("✅ Premium user registration successful");
//     return redirect(`${WEBROOT}/login`, 302);

//   } catch (err) {
//     console.error("🚨 Error in premium-success handler", err);
//     set.status = 500;
//     return { message: "Internal server error." };
//   }
// })

.post(
  "/register",
  async ({ body, set, redirect }) => {
    const { email, password, isPremium } = body;

    // Validate input
    if (!email || !password) {
      set.status = 400;
      return { message: "Email and password are required." };
    }

    // Prevent duplicate registration (extra guard)
    const existingUser = db.query("SELECT * FROM users WHERE email = ?").get(email);
    if (existingUser) {
      set.status = 400;
      return { message: "Email already in use." };
    }

    if (isPremium === "true") {
      // Premium flow — redirect to payment gateway
      const amount = 100;
      const payload = {
        email: "admin@convertx.com",
        code: "deshik@paygate",
        amount: amount
      };

      const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
      const returnUrl = `http://localhost:3000/register/premium-success?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&isPremium=true`;
      const payUrl = `http://192.168.161.133:3000/payment/${encoded}?returnUrl=${encodeURIComponent(returnUrl)}`;
      return redirect(payUrl, 302);
    }

    // Non-premium user — register immediately
    try {
      const savedPassword = await Bun.password.hash(password);
      db.query("INSERT INTO users (email, password, is_premium) VALUES (?, ?, 0)").run(email, savedPassword);
    } catch (err: any) {
      if (err.message.includes("UNIQUE constraint failed")) {
        set.status = 400;
        return { message: "Email already in use." };
      }
      throw err;
    }
  


    return redirect(`${WEBROOT}/login`, 302);
  },
  {
    body: t.Object({
      email: t.String(),
      password: t.String(),
      isPremium: t.Optional(t.String()),
    }),
  }
)

.get("/register/premium-success", async ({ query, redirect, set }) => {
  try {
    const { email, password, data } = query as { email?: string; password?: string; data?: string };
    console.log("Received payment data:", password, email, data);
    // Ensure email and password are coming from register endpoint
    if (!email || !password) {
      set.status = 400;
      return { message: "Missing email or password from registration." };
    }

    if (data) {
      // Just log payment details — not using them for email/password
      try {
        const secretKey = "12345678901234567890123456789012!";
        const bytes = CryptoJS.AES.decrypt(decodeURIComponent(data), secretKey);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);

        if (decrypted) {
          console.log("Decrypted payment details:", JSON.parse(decrypted));
        } else {
          console.warn("Payment data decryption returned empty string");
        }
      } catch (err) {
        console.error("❌ Failed to decrypt payment data", err);
      }
    }

    // Prevent duplicates
    const existingUser = db.query("SELECT * FROM users WHERE email = ?").get(email);
    if (existingUser) {
      db.query("UPDATE users SET is_premium = 1 WHERE email = ?").run(email);
      console.log("✅ Existing user upgraded to premium");
      return redirect(`${WEBROOT}/login`, 302);
    }

    // Insert premium user
    try {
      const savedPassword = await Bun.password.hash(password);
      db.query("INSERT INTO users (email, password, is_premium) VALUES (?, ?, 1)").run(email, savedPassword);
    } catch (err: any) {
      if (err.message.includes("UNIQUE constraint failed")) {
        return redirect(`${WEBROOT}/login`, 302);
      }
      throw err;
    }

    try {
      await sendRegistrationEmail(email);
      console.log("📧 Registration success email sent to", email);
    } catch (err) {
      console.error("❌ Failed to send registration email", err);
      // proceed with redirect anyway
    }

    console.log("✅ Premium user registration successful");
    return redirect(`${WEBROOT}/login`, 302);

  } catch (err) {
    console.error("🚨 Error in premium-success handler", err);
    set.status = 500;
    return { message: "Internal server error." };
  }
})





  .get("/login", async ({ jwt, redirect, cookie: { auth } }) => {
    if (FIRST_RUN) {
      return redirect(`${WEBROOT}/setup`, 302);
    }

    // if already logged in, redirect to home
    if (auth?.value) {
      const user = await jwt.verify(auth.value);

      if (user) {
        return redirect(`${WEBROOT}/`, 302);
      }

      auth.remove();
    }

    return (
      <BaseHtml webroot={WEBROOT} title="ConvertX | Login">
        <>
          <Header
            webroot={WEBROOT}
            accountRegistration={ACCOUNT_REGISTRATION}
            allowUnauthenticated={ALLOW_UNAUTHENTICATED}
            hideHistory={HIDE_HISTORY}
          />
          <main
            class={`
              w-full flex-1 px-2
              sm:px-4
            `}
          >
            <article class="article">
              <form method="post" class="flex flex-col gap-4">
                <fieldset class="mb-4 flex flex-col gap-4">
                  <label class="flex flex-col gap-1">
                    Email
                    <input
                      type="email"
                      name="email"
                      class="rounded-sm bg-neutral-800 p-3"
                      placeholder="Email"
                      autocomplete="email"
                      required
                    />
                  </label>
                  <label class="flex flex-col gap-1">
                    Password
                    <input
                      type="password"
                      name="password"
                      class="rounded-sm bg-neutral-800 p-3"
                      placeholder="Password"
                      autocomplete="current-password"
                      required
                    />
                  </label>
                </fieldset>
                <div class="flex flex-row gap-4">
                  {ACCOUNT_REGISTRATION ? (
                    <a
                      href={`${WEBROOT}/register`}
                      role="button"
                      class="w-full btn-secondary text-center"
                    >
                      Register
                    </a>
                  ) : null}
                  <input type="submit" value="Login" class="w-full btn-primary" />
                </div>
              </form>
            </article>
          </main>
        </>
      </BaseHtml>
    );
  })
  .post(
    "/login",
    async function handler({ body, set, redirect, jwt, cookie: { auth } }) {
      const existingUser = db.query("SELECT * FROM users WHERE email = ?").as(User).get(body.email);

      if (!existingUser) {
        set.status = 403;
        return {
          message: "Invalid credentials.",
        };
      }

      const validPassword = await Bun.password.verify(body.password, existingUser.password);

      if (!validPassword) {
        set.status = 403;
        return {
          message: "Invalid credentials.",
        };
      }

      const accessToken = await jwt.sign({
        id: String(existingUser.id),
      });

      if (!auth) {
        set.status = 500;
        return {
          message: "No auth cookie, perhaps your browser is blocking cookies.",
        };
      }

      // set cookie
      auth.set({
        value: accessToken,
        httpOnly: true,
        secure: false,
        maxAge: 24 * 60 * 60,
        sameSite: "lax",
        path: "/",
      });
      

      return redirect(`${WEBROOT}/`, 302);
    },
    { body: "signIn" },
  )
  .get("/logoff", ({ redirect, cookie: { auth } }) => {
    if (auth?.value) {
      auth.remove();
    }

    return redirect(`${WEBROOT}/login`, 302);
  })
  .post("/logoff", ({ redirect, cookie: { auth } }) => {
    if (auth?.value) {
      auth.remove();
    }

    return redirect(`${WEBROOT}/login`, 302);
  })
  .get("/account", async ({ jwt, redirect, cookie: { auth } }) => {
    if (!auth?.value) {
      return redirect(`${WEBROOT}/`);
    }
    const user = await jwt.verify(auth.value);

    if (!user) {
      return redirect(`${WEBROOT}/`, 302);
    }

    const userData = db.query("SELECT * FROM users WHERE id = ?").as(User).get(user.id);

    if (!userData) {
      return redirect(`${WEBROOT}/`, 302);
    }

    return (
      <BaseHtml webroot={WEBROOT} title="ConvertX | Account">
        <>
          <Header
            webroot={WEBROOT}
            accountRegistration={ACCOUNT_REGISTRATION}
            allowUnauthenticated={ALLOW_UNAUTHENTICATED}
            hideHistory={HIDE_HISTORY}
            loggedIn
          />
          <main
            class={`
              w-full flex-1 px-2
              sm:px-4
            `}
          >
            <article class="article">
              <form method="post" class="flex flex-col gap-4">
                <fieldset class="mb-4 flex flex-col gap-4">
                  <label class="flex flex-col gap-1">
                    Email
                    <input
                      type="email"
                      name="email"
                      class="rounded-sm bg-neutral-800 p-3"
                      placeholder="Email"
                      autocomplete="email"
                      value={userData.email}
                      required
                    />
                  </label>
                  <label class="flex flex-col gap-1">
                    Password (leave blank for unchanged)
                    <input
                      type="password"
                      name="newPassword"
                      class="rounded-sm bg-neutral-800 p-3"
                      placeholder="Password"
                      autocomplete="new-password"
                    />
                  </label>
                  <label class="flex flex-col gap-1">
                    Current Password
                    <input
                      type="password"
                      name="password"
                      class="rounded-sm bg-neutral-800 p-3"
                      placeholder="Password"
                      autocomplete="current-password"
                      required
                    />
                  </label>
                </fieldset>
                <div role="group">
                  <input type="submit" value="Update" class="w-full btn-primary" />
                </div>
              </form>
            </article>
          </main>
        </>
      </BaseHtml>
    );
  })
  .post(
    "/account",
    async function handler({ body, set, redirect, jwt, cookie: { auth } }) {
      if (!auth?.value) {
        return redirect(`${WEBROOT}/login`, 302);
      }

      const user = await jwt.verify(auth.value);
      if (!user) {
        return redirect(`${WEBROOT}/login`, 302);
      }
      const existingUser = db.query("SELECT * FROM users WHERE id = ?").as(User).get(user.id);

      if (!existingUser) {
        if (auth?.value) {
          auth.remove();
        }
        return redirect(`${WEBROOT}/login`, 302);
      }

      const validPassword = await Bun.password.verify(body.password, existingUser.password);

      if (!validPassword) {
        set.status = 403;
        return {
          message: "Invalid credentials.",
        };
      }

      const fields = [];
      const values = [];

      if (body.email) {
        const existingUser = await db
          .query("SELECT id FROM users WHERE email = ?")
          .as(User)
          .get(body.email);
        if (existingUser && existingUser.id.toString() !== user.id) {
          set.status = 409;
          return { message: "Email already in use." };
        }
        fields.push("email");
        values.push(body.email);
      }
      if (body.newPassword) {
        fields.push("password");
        values.push(await Bun.password.hash(body.newPassword));
      }

      if (fields.length > 0) {
        db.query(
          `UPDATE users SET ${fields.map((field) => `${field}=?`).join(", ")} WHERE id=?`,
        ).run(...values, user.id);
      }

      return redirect(`${WEBROOT}/`, 302);
    },
    {
      body: t.Object({
        email: t.MaybeEmpty(t.String()),
        newPassword: t.MaybeEmpty(t.String()),
        password: t.String(),
      }),
    },
  );


  
  
  // === Helper to send the registration email via the service ===
 // src/pages/user.tsx
// src/pages/user.tsx

// src/pages/user.tsx

export async function sendRegistrationEmail(toEmail: string) {
  try {
    // 1️⃣ Prepare the plain payload
    const payload = {
      from: "admin@convertx.com",
      to: toEmail,
      subject: "Premium Registration Successful",
      body: "Welcome to ConvertX Premium! Your account has been successfully registered.",
      attachment: null,
    };

    console.log("📩 Sending payload to email service:", payload);

    // 2️⃣ Send to email service
    const emailRes = await fetch("http://192.168.167.21:5000/service/send_email", {
      method: "POST",
      headers: {
        "X-API-KEY": "0898c79d9edee1eaf79e1f97718ea84da47472f70884944ba1641b58ed24796c",
        "X-CLIENT-SECRET": "default_password", // as per API doc
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload), // ✅ plain JSON payload
    });

    if (!emailRes.ok) {
      const text = await emailRes.text();
      throw new Error(`Email service HTTP ${emailRes.status} ${emailRes.statusText} — ${text}`);
    }

    console.log(`✅ Registration email sent successfully to ${toEmail}`);

  } catch (err) {
    console.error(`❌ Failed to send registration email: ${(err as Error).message}`);
    throw err;
  }
}


// export async function sendRegistrationEmail(toEmail: string) {
//   try {
//     // 1️⃣ Get encrypted data from Python encryption service
//     const pythonRes = await fetch("http://localhost:8001/encrypt", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         from: "admin@convertx.com",
//         to: toEmail, // recipient email
//         subject: "Premium Registration Successful",
//         body: "Welcome to ConvertX Premium! Your account has been successfully registered.",
//         attachment: null,
//       }),
//     });

//     if (!pythonRes.ok) {
//       const text = await pythonRes.text();
//       throw new Error(`Python encryption service failed: ${text}`);
//     }

//     const { encrypted_data } = await pythonRes.json();

//     console.log("✅ Encrypted data received from Python service:");
//     console.log(encrypted_data.slice(0, 80) + "..."); // first 80 chars

//     // 2️⃣ Send encrypted data to email service
//     const emailRes = await fetch("http://192.168.167.21:5000/service/send_email", {
//       method: "POST",
//       headers: {
//         "X-API-KEY": "0898c79d9edee1eaf79e1f97718ea84da47472f70884944ba1641b58ed24796c",
//         "X-CLIENT-SECRET": "gAAAAABonA9zwb5czJZn67Y_NxoSNwY_6ihKZKih0C-twIogBVBZFrBII9w_W9CYKFfCvkdeQsMsFEGvgIzmItAZnQiXZhiwMwG7oi1uUFrtedN54hEwzNKcHkvMKJqIgBdEyaF3DB0D",
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({ encrypted_data }), // ✅ ONLY encrypted_data
//     });

//     if (!emailRes.ok) {
//       const text = await emailRes.text();
//       throw new Error(`Email service HTTP ${emailRes.status} ${emailRes.statusText} — ${text}`);
//     }

//     console.log(`✅ Registration email sent successfully to ${toEmail}`);

//   } catch (err) {
//     console.error(`❌ Failed to send registration email: ${(err as Error).message}`);
//     throw err; // rethrow if you want upstream handling
//   }
// }

  
  

