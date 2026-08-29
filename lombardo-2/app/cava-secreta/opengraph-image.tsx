import { ImageResponse } from "next/og";

export const alt = "La Cava Secreta de Lombardo";
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
        justifyContent: "space-between",
        background: "#140f0d",
        color: "#f5efe3",
        padding: "68px 76px",
      }}
    >
      <div style={{ display: "flex", fontSize: 25, letterSpacing: 7 }}>
        LOMBARDO. · UNA BOTELLA POR DÍA
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 102, lineHeight: 0.86, letterSpacing: -7, fontWeight: 700 }}>LA CAVA</div>
        <div style={{ display: "flex", fontSize: 102, lineHeight: 0.86, letterSpacing: -7, fontWeight: 700, color: "#d65a47" }}>SECRETA.</div>
      </div>
      <div style={{ display: "flex", fontSize: 32, letterSpacing: 1 }}>
        LA BOTELLA DE HOY YA ESTÁ ESCONDIDA.
      </div>
    </div>,
    size,
  );
}
