import { NextRequest, NextResponse } from "next/server";

const MODEL_ID = "fal-ai/flux-2/klein/realtime";
const TOKEN_DURATION_SECONDS = 120;

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    falKeyConfigured: Boolean(process.env.FAL_KEY),
    model: MODEL_ID,
  });
}

export async function POST(req: NextRequest) {
  const falKey = process.env.FAL_KEY;

  if (!falKey) {
    return NextResponse.json(
      { error: "FAL_KEY belum diatur di Vercel Environment Variables." },
      { status: 500 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const app = typeof body?.app === "string" ? body.app : "";

    if (!app) {
      return NextResponse.json({ error: "Parameter app tidak ditemukan." }, { status: 400 });
    }

    // Never mint a token for an arbitrary fal endpoint from this public route.
    if (app !== MODEL_ID) {
      return NextResponse.json(
        { error: `Model tidak diizinkan: ${app}` },
        { status: 403 },
      );
    }

    // Current fal realtime token endpoint. The token must be scoped to the
    // full normalized app path that tokenProvider receives.
    const response = await fetch("https://rest.fal.ai/tokens/realtime", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowed_apps: [app],
        duration: TOKEN_DURATION_SECONDS,
      }),
      cache: "no-store",
    });

    const data = await response.json().catch(async () => ({
      error: await response.text().catch(() => "Unknown fal token error"),
    }));

    if (!response.ok) {
      console.error("fal realtime token error:", data);
      return NextResponse.json(
        {
          error:
            typeof data?.detail === "string"
              ? data.detail
              : typeof data?.error === "string"
                ? data.error
                : "Gagal membuat token fal realtime.",
        },
        { status: response.status },
      );
    }

    const token =
      typeof data === "string"
        ? data
        : typeof data?.token === "string"
          ? data.token
          : null;

    if (!token) {
      console.error("fal token response has no token:", data);
      return NextResponse.json(
        { error: "Respons fal tidak berisi token realtime." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { token },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("fal token endpoint failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Token generation failed." },
      { status: 500 },
    );
  }
}
