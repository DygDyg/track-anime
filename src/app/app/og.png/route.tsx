import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #0c0e14 0%, #17213b 100%)",
          color: "#f3f5fa",
          display: "flex",
          height: "100%",
          padding: "72px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background: "#6c8cff",
            borderRadius: "999px",
            height: "460px",
            opacity: 0.2,
            position: "absolute",
            right: "-80px",
            top: "-130px",
            width: "460px",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", maxWidth: "830px" }}>
          <div style={{ color: "#9eb4ff", display: "flex", fontSize: "28px", fontWeight: 700, letterSpacing: "2px" }}>
            TRACK ANIME
          </div>
          <div style={{ display: "flex", fontSize: "72px", fontWeight: 700, letterSpacing: "-2px", lineHeight: 1.05, marginTop: "34px" }}>
            Приложение для Android
          </div>
          <div style={{ color: "#c3cad9", display: "flex", fontSize: "32px", lineHeight: 1.3, marginTop: "28px" }}>
            Смотрите аниме на телефоне, планшете и Android TV
          </div>
          <div
            style={{
              alignItems: "center",
              background: "rgba(108, 140, 255, 0.18)",
              border: "2px solid rgba(158, 180, 255, 0.45)",
              borderRadius: "18px",
              color: "#dfe6ff",
              display: "flex",
              fontSize: "26px",
              fontWeight: 600,
              marginTop: "48px",
              padding: "18px 28px",
              width: "fit-content",
            }}
          >
            Скачать APK
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    },
  );
}
