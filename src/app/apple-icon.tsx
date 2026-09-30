import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0b",
      }}
    >
      <div
        style={{
          width: "50%",
          height: "50%",
          background: "#0e3f36",
          border: "8px solid #cfb997",
          transform: "rotate(45deg)",
        }}
      />
    </div>,
    { ...size },
  );
}
