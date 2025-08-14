import { Elysia } from "elysia";
import { Html } from "@elysiajs/html";

export const premiumPage = new Elysia().get("/premium-required", ({ query }) => {
  const email = query.email || "";
  const password= query.password || "";
console.log("Email:", email);
  // Build the payment URL
  const payload = {
    email: "admin@convertx.com",
    code: "deshik@paygate",
    amount: 100
  };
  const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
  const returnUrl = `http://localhost:3000/register/premium-success?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&isPremium=true`;
  const payUrl = `http://192.168.161.133:3000/payment/${encoded}?returnUrl=${encodeURIComponent(returnUrl)}`;
  
  return (
    <>
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background-color: #f3f4f6;">
  <div style="background-color: #ffffff; padding: 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); text-align: center; max-width: 400px; width: 100%;">
    <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 16px; color: #111827;">Upgrade Required</h1>
    <p style="margin-bottom: 24px; color: #374151; line-height: 1.5;">
      Tesseract OCR is a premium feature. Register as premium to use this functionality.
    </p>
    <div style="display: flex; justify-content: center; gap: 12px;">
      <button
        style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;"
        onclick={`window.location.href='${payUrl}'`}
      >
        Register as Premium
      </button>
      <button
        style="background-color: #d1d5db; color: #111827; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;"
        onclick="window.history.back()"
      >
        Go Back
      </button>
    </div>
  </div>
</div>

    </>
  );
});
