import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getGuide } from "@/lib/seo/guides";

export const alt = "Guías Lombardo: para elegir mejor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const colors = {
  blue: { background: "#003a70", foreground: "#f5efe3", accent: "#f2a0b6" },
  red: { background: "#d85343", foreground: "#003a70", accent: "#b9cc72" },
  green: { background: "#b9cc72", foreground: "#003a70", accent: "#d85343" },
  pink: { background: "#f2a0b6", foreground: "#003a70", accent: "#d85343" },
  beige: { background: "#eee1c9", foreground: "#003a70", accent: "#d85343" },
} as const;

const fontFiles = Promise.all([
  readFile(join(process.cwd(), "public/fonts/GopherDisplay-Regular.woff2")),
  readFile(join(process.cwd(), "public/fonts/GopherDisplay-Bold.woff2")),
]);

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getGuide((await params).slug);
  const palette = colors[guide?.heroTone ?? "blue"];
  const [regular, bold] = await fontFiles;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", padding: "54px 64px", display: "flex", flexDirection: "column", justifyContent: "space-between", background: palette.background, color: palette.foreground, fontFamily: "Gopher" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, letterSpacing: "0.12em", fontWeight: 700 }}>
        <span>LOMBARDO™ / GUÍAS</span><span>{guide?.cluster.toUpperCase() ?? "PARA ELEGIR MEJOR"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 48 }}>
        <div style={{ maxWidth: 880, display: "flex", flexDirection: "column" }}>
          <span style={{ marginBottom: 20, color: palette.accent, fontSize: 22, letterSpacing: "0.12em", fontWeight: 700 }}>{guide?.eyebrow ?? "EDITORIAL"}</span>
          <span style={{ fontSize: guide && guide.title.length > 54 ? 72 : 88, lineHeight: 0.86, letterSpacing: "-0.045em", fontWeight: 700, textTransform: "uppercase" }}>{guide?.title ?? "PARA ELEGIR MEJOR."}</span>
        </div>
        <span style={{ color: palette.accent, fontSize: 168, lineHeight: 0.7, fontWeight: 700 }}>.</span>
      </div>
    </div>,
    { ...size, fonts: [{ name: "Gopher", data: regular, weight: 400 }, { name: "Gopher", data: bold, weight: 700 }] },
  );
}
