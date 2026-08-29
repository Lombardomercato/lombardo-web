import { ImageResponse } from "next/og";

export const alt = "LOMBARDO. — Vinos, destilados y regalos online en Rosario";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "72px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#003a70",
        color: "#fffdf9",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
        LOMBARDO™
      </div>
      <div style={{ display: "flex", maxWidth: 970, fontSize: 82, fontWeight: 700, lineHeight: 0.98 }}>
        VINOS, DESTILADOS Y REGALOS ONLINE EN ROSARIO.
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28 }}>
        <span>QUEDAR BIEN ES FÁCIL.</span>
        <span style={{ color: "#ffb3ab" }}>LOMBARDOMERCATO.COM</span>
      </div>
    </div>,
    size,
  );
}
