import {
  AbsoluteFill,
  Series,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const BG = "#0d1017";
const CARD = "#151a24";
const BORDER = "#273044";
const TEXT = "#edf1f7";
const MUTED = "#8d97ab";
const ACCENT = "#6ea8fe";
const GREEN = "#3dd68c";
const ORANGE = "#f5a623";

const CODE = `import { renderSound, buildSoundConfig } from "make-sfx-core";

const jump = buildSoundConfig({ preset: "jump", punch: 0.5 });
writeFileSync("jump.wav", renderSound(jump, {
  seed: 42,
  category: "combat",
}));`;

const MCP_TEXT = `sfx_from_description({
  description: "zıplama ve tiz blink",
  outputDir: "./assets/sfx"
})`;

const CATEGORIES = [
  { id: "ui", lufs: "-14", color: ACCENT },
  { id: "combat", lufs: "-9", color: ORANGE },
  { id: "pickup", lufs: "-12", color: GREEN },
  { id: "stinger", lufs: "-11", color: "#c77dff" },
];

function WaveBars({ frame }: { frame: number }) {
  const bars = 32;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
      {Array.from({ length: bars }, (_, i) => {
        const h =
          12 +
          Math.abs(Math.sin((frame + i * 3) * 0.18)) * 56 +
          Math.abs(Math.cos((frame + i) * 0.11)) * 18;
        return (
          <div
            key={i}
            style={{
              width: 8,
              height: h,
              borderRadius: 3,
              background: `linear-gradient(180deg, ${ACCENT}, ${GREEN})`,
              opacity: 0.85,
            }}
          />
        );
      })}
    </div>
  );
}

function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = spring({ frame, fps, config: { damping: 14 } });
  const subIn = spring({ frame: frame - 12, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill
      style={{
        background: BG,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Segoe UI, system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: TEXT,
            transform: `scale(${interpolate(titleIn, [0, 1], [0.9, 1])})`,
            opacity: titleIn,
            letterSpacing: -1,
          }}
        >
          make-sfx
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 28,
            color: MUTED,
            opacity: subIn,
            transform: `translateY(${interpolate(subIn, [0, 1], [16, 0])}px)`,
          }}
        >
          <span style={{ color: ACCENT }}>Remotion</span> for SFX — code → mastered WAV
        </div>
      </div>
    </AbsoluteFill>
  );
}

function CodeScene() {
  const frame = useCurrentFrame();
  const chars = Math.floor(
    interpolate(frame, [0, 70], [0, CODE.length], { extrapolateRight: "clamp" }),
  );
  const panelIn = spring({ frame, fps: 30, config: { damping: 18 } });

  return (
    <AbsoluteFill style={{ background: BG, padding: 48, fontFamily: "Consolas, monospace" }}>
      <div style={{ color: MUTED, fontSize: 22, marginBottom: 16, opacity: panelIn }}>
        Procedural synthesis + loudness mastering
      </div>
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 24,
          fontSize: 17,
          lineHeight: 1.5,
          color: "#c9d1d9",
          opacity: panelIn,
          whiteSpace: "pre",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        {CODE.slice(0, chars)}
        <span style={{ opacity: frame % 20 < 10 ? 1 : 0, color: ACCENT }}>|</span>
      </div>
    </AbsoluteFill>
  );
}

function McpScene() {
  const frame = useCurrentFrame();
  const slide = spring({ frame, fps: 30, config: { damping: 16 } });

  return (
    <AbsoluteFill style={{ background: BG, padding: 48, fontFamily: "Segoe UI, system-ui, sans-serif" }}>
      <div style={{ color: TEXT, fontSize: 26, fontWeight: 700, marginBottom: 20 }}>
        MCP — describe in natural language
      </div>
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 20,
          color: GREEN,
          fontFamily: "Consolas, monospace",
          fontSize: 16,
          opacity: slide,
          transform: `translateY(${interpolate(slide, [0, 1], [24, 0])}px)`,
        }}
      >
        {MCP_TEXT}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
        {CATEGORIES.map((c, i) => {
          const itemIn = spring({ frame: frame - i * 6, fps: 30, config: { damping: 14 } });
          return (
            <div
              key={c.id}
              style={{
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: "12px 16px",
                opacity: itemIn,
                transform: `translateY(${interpolate(itemIn, [0, 1], [20, 0])}px)`,
              }}
            >
              <div style={{ color: c.color, fontWeight: 700, fontSize: 18 }}>{c.id}</div>
              <div style={{ color: MUTED, fontSize: 14, marginTop: 4 }}>{c.lufs} LUFS</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function OutroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inAnim = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill
      style={{
        background: BG,
        padding: 48,
        fontFamily: "Segoe UI, system-ui, sans-serif",
        justifyContent: "center",
      }}
    >
      <div style={{ opacity: inAnim }}>
        <WaveBars frame={frame} />
        <div style={{ marginTop: 28, fontSize: 30, fontWeight: 700, color: TEXT }}>
          Seed variants · category LUFS · true-peak safe
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 22,
            color: ACCENT,
            fontFamily: "Consolas, monospace",
          }}
        >
          npm install make-sfx-core · npx make-sfx-mcp
        </div>
        <div style={{ marginTop: 12, fontSize: 18, color: MUTED }}>
          github.com/Tuntii/make-sfx
        </div>
      </div>
    </AbsoluteFill>
  );
}

export const MakeSfxDemo = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={90}>
        <IntroScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={120}>
        <CodeScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={120}>
        <McpScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={120}>
        <OutroScene />
      </Series.Sequence>
    </Series>
  );
};