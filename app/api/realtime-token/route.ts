import { NextRequest } from "next/server";

const MODEL_ID = "fal-ai/flux-2/klein/realtime";
const ALLOWED_ALIAS = "flux-2";

export async function POST(req: NextRequest) {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return new Response("FAL_KEY belum diatur di server.", { status: 500 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedApp = body?.app;

    // Never mint a token for an arbitrary fal app from a public endpoint.
    if (requestedApp && requestedApp !== MODEL_ID) {
      return new Response("Model tidak diizinkan.", { status: 403 });
    }

    const response = await fetch("https://rest.alpha.fal.ai/tokens/", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowed_apps: [ALLOWED_ALIAS],
        token_expiration: 120,
      }),
      cache: "no-store",
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error("fal token error:", raw);
      return new Response(raw || "Gagal membuat token fal realtime.", {
        status: response.status,
      });
    }

    let token: unknown = raw;
    try {
      token = JSON.parse(raw);
      if (typeof token === "object" && token && "detail" in token) {
        token = (token as { detail: unknown }).detail;
      }
    } catch {
      // Raw token is valid too.
    }

    return new Response(typeof token === "string" ? token : JSON.stringify(token), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("fal token endpoint failed:", error);
    return new Response("Token generation failed.", { status: 500 });
  }
}
