import QRCode from "qrcode";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const appUrl = new URL("/app", request.url).toString();
  const svg = await QRCode.toString(appUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 1024,
    color: { dark: "#0c0e14", light: "#ffffff" },
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
