import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0b",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 200,
          height: 200,
          background: "#0e3f36",
          border: "8px solid #cfb997",
          transform: "rotate(45deg)",
          marginBottom: 80,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span
          style={{
            fontSize: 84,
            fontWeight: 600,
            color: "#fbfbfa", // Warm Ivory
            letterSpacing: "-0.04em",
          }}
        >
          Lumen
        </span>
        <span
          style={{
            fontSize: 32,
            fontWeight: 500,
            color: "#cfb997", // Champagne Gold
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          AI Teacher
        </span>
      </div>
    </div>,
    { ...size },
  );
}
