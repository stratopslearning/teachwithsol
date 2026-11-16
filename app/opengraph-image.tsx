import { ImageResponse } from "next/og";

import {
  SOL_CREAM_HEX,
  SOL_MARK_PATH,
  SOL_MARK_VIEWBOX,
} from "@/lib/brand/solMark";

export const alt = "SOL. The operating system for teaching.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1c1b17";
const INK_MUTED = "#5c5a52";
const DESCRIPTION =
  "SOL is the AI teaching layer for the LMS you already use. Turn your materials into courses, practice, and tutoring.";

async function loadInstrumentSerif(): Promise<ArrayBuffer | null> {
  try {
    const cssRes = await fetch(
      "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap",
      {
        headers: {
          // Google returns TTF/OTF URLs only for non-browser UAs.
          "User-Agent": "Mozilla/5.0 (compatible; SolOG/1.0)",
        },
      },
    );
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(
      /src:\s*url\(([^)]+)\)\s*format\(['"]?(?:opentype|truetype)['"]?\)/,
    );
    const fontUrl = match?.[1];
    if (!fontUrl) return null;
    const fontRes = await fetch(fontUrl);
    if (!fontRes.ok) return null;
    return fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const fontData = await loadInstrumentSerif();
  const fonts = fontData
    ? [
        {
          name: "Instrument Serif",
          data: fontData,
          style: "normal" as const,
          weight: 400 as const,
        },
      ]
    : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: SOL_CREAM_HEX,
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg
            width="56"
            height="58"
            viewBox={SOL_MARK_VIEWBOX}
            fill="none"
          >
            <path fill={INK} fillRule="evenodd" d={SOL_MARK_PATH} />
          </svg>
          <span
            style={{
              fontSize: 42,
              fontFamily: fonts.length ? "Instrument Serif" : "Georgia, serif",
              color: INK,
              letterSpacing: "-0.02em",
            }}
          >
            SOL
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 64,
              lineHeight: 1.1,
              fontFamily: fonts.length ? "Instrument Serif" : "Georgia, serif",
              color: INK,
              letterSpacing: "-0.02em",
              maxWidth: 980,
            }}
          >
            <span>The operating system</span>
            <span style={{ fontStyle: "italic" }}>for teaching.</span>
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.35,
              color: INK_MUTED,
              maxWidth: 820,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {DESCRIPTION}
          </div>
        </div>
      </div>
    ),
    // An empty `fonts` array replaces the bundled default font and makes the
    // render throw ("No fonts are loaded"), failing the build whenever the
    // Google Fonts download fails. Only pass fonts when we have one.
    fonts.length ? { ...size, fonts } : size,
  );
}
