import { Elysia } from "elysia";
import { Html } from "@elysiajs/html";

export const premiumPage = new Elysia().get("/premium-required", ({ query }) => {
  const email = query.email || "";

  // Build the payment URL
  const payload = {
    email: "thabitha@gmail.com",
    code: "thabitha@paygate",
    amount: 100
  };
  const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
  const returnUrl = `http://localhost:3000/register/premium-success?email=${encodeURIComponent(email)}&isPremium=true`;
  const payUrl = `http://192.168.161.133:3000/payment/${encoded}?returnUrl=${encodeURIComponent(returnUrl)}`;

  return (
    <>
      <div class="min-h-screen flex items-center justify-center bg-gray-100">
        <div class="bg-white p-8 rounded shadow-lg text-center max-w-md">
          <h1 class="text-2xl font-bold mb-4">Upgrade Required</h1>
          <p class="mb-6">
            Tesseract OCR is a premium feature. Register as premium to use this functionality.
          </p>
          <div class="flex justify-center gap-2">
            <button
              class="bg-blue-600 text-white px-4 py-2 rounded"
              onclick={`window.location.href='${payUrl}'`}
            >
              Register as Premium
            </button>
            <button
              class="bg-gray-300 px-4 py-2 rounded"
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
