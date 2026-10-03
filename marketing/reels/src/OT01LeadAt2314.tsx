import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, COLUMN, COLUMN_LEFT, fontFamily, WIDTH } from "./theme";

/**
 * OT01 "ליד ב־23:14" — 15 s, 1080x1920, no audio.
 *
 * The pain line from /for-whom (a lead at night, seen in the morning, already
 * gone), the scatter of tools it comes from, the one operating layer that
 * fixes it (the flow from the home page), and the CTA: a free 20 min call.
 */
export const beats = {
  lead: { from: 0, duration: 105 },
  chaos: { from: 105, duration: 90 },
  flow: { from: 195, duration: 150 },
  end: { from: 345, duration: 105 },
};
export const DURATION = 450;

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const usePop = (from: number, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - from, fps, config: { damping } });
};

const column: React.CSSProperties = {
  position: "absolute",
  left: COLUMN_LEFT,
  width: COLUMN,
};

const Num: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <bdi dir="ltr" style={{ unicodeBidi: "isolate" }}>
    {children}
  </bdi>
);

/** Dark site background: deep navy, two slow glows and a faint grid. */
const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const d = (i: number) => Math.sin(frame / 45 + i) * 40;
  return (
    <AbsoluteFill style={{ background: colors.bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${colors.line} 1px, transparent 1px), linear-gradient(90deg, ${colors.line} 1px, transparent 1px)`,
          backgroundSize: "90px 90px",
          opacity: 0.35,
          maskImage:
            "radial-gradient(ellipse at 50% 45%, black 20%, transparent 75%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -260 + d(0),
          top: 120 + d(1),
          width: 760,
          height: 760,
          borderRadius: 760,
          background: colors.blue,
          filter: "blur(160px)",
          opacity: 0.45,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 560 + d(2),
          top: 1100 + d(3),
          width: 700,
          height: 700,
          borderRadius: 700,
          background: colors.cyan,
          filter: "blur(170px)",
          opacity: 0.22,
        }}
      />
    </AbsoluteFill>
  );
};

/** Burned-in narration line. Reels are watched muted. */
const Headline: React.FC<{
  children: React.ReactNode;
  from?: number;
  until?: number;
  color?: string;
}> = ({ children, from = 0, until, color = colors.text }) => {
  const frame = useCurrentFrame();
  const enter = usePop(from, 12);
  const exit =
    until === undefined
      ? 1
      : interpolate(frame, [until - 6, until], [1, 0], clamp);
  if (frame < from || (until !== undefined && frame > until)) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 240,
        left: 96,
        width: WIDTH - 192,
        textAlign: "center",
        fontSize: 80,
        lineHeight: 1.15,
        fontWeight: 900,
        letterSpacing: "-0.01em",
        color,
        opacity: Math.min(enter, exit),
        transform: `translateY(${(1 - enter) * 40}px)`,
      }}
    >
      {children}
    </div>
  );
};

const Accent: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = colors.cyan,
}) => <span style={{ color }}>{children}</span>;

/** public/ort-tech-mark.svg, with a cyan rim so it reads on the dark site bg. */
const Mark: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    style={{ filter: `drop-shadow(0 0 40px ${colors.cyan}55)` }}
  >
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M60 9 14 35v50l46 26 46-26V35L60 9Z"
        fill={colors.markDark}
        stroke={colors.cyan}
        strokeOpacity={0.55}
        strokeWidth={3}
      />
      <circle cx="50" cy="60" r="20" stroke={colors.cream} strokeWidth={10} />
      <path
        d="m69 60 26-15v30L69 60Z"
        fill={colors.green}
        stroke={colors.green}
        strokeWidth={4}
      />
      <path d="M27 92h66" stroke={colors.green} strokeWidth={7} />
    </g>
  </svg>
);

const Shot: React.FC<{ duration: number; children: React.ReactNode }> = ({
  duration,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 6, duration - 6, duration],
    [0, 1, 1, 0],
    clamp,
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

const panel: React.CSSProperties = {
  background: `linear-gradient(180deg, ${colors.panel2}, ${colors.panel})`,
  border: `2px solid ${colors.line}`,
  borderRadius: 36,
  boxShadow: "0 24px 60px rgba(0,0,0,.55)",
};

// ── 1. The lead that got away ──────────────────────────────────────────────

const NIGHT = 23 * 60 + 14;
const MORNING = 8 * 60 + 32 + 24 * 60;
const FLIP_FROM = 36;
const FLIP_TO = 58;
const LOST_AT = 70;

const clock = (minutes: number) => {
  const m = Math.round(minutes) % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const Lead: React.FC = () => {
  const frame = useCurrentFrame();
  const card = usePop(4, 13);
  const lost = usePop(LOST_AT, 10);
  const minutes = interpolate(frame, [FLIP_FROM, FLIP_TO], [NIGHT, MORNING], {
    ...clamp,
    easing: (x) => x * x * (3 - 2 * x),
  });
  const night = frame < FLIP_FROM + (FLIP_TO - FLIP_FROM) / 2;
  const shake = frame >= LOST_AT ? Math.sin(frame * 2.4) * 10 * (1 - lost) : 0;
  return (
    <>
      <Headline until={34}>
        ליד נכנס ב־<Accent>
          <Num>23:14</Num>
        </Accent>
      </Headline>
      <Headline from={36} until={68}>
        ראית אותו רק בבוקר
      </Headline>
      <Headline from={70} color={colors.red}>
        והוא כבר סגר עם מישהו אחר
      </Headline>

      <div
        style={{
          ...column,
          top: 560,
          textAlign: "center",
          fontSize: 200,
          fontWeight: 900,
          lineHeight: 1,
          color: night ? colors.mute : colors.text,
          opacity: card,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <Num>{clock(minutes)}</Num>
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: colors.mute,
            marginTop: 10,
          }}
        >
          {night ? "לילה. הטלפון על שקט." : "בוקר. סוף סוף פותח הודעות."}
        </div>
      </div>

      <div
        style={{
          ...column,
          ...panel,
          top: 930,
          padding: 34,
          display: "flex",
          gap: 26,
          alignItems: "center",
          opacity: card,
          border: `3px solid ${frame >= LOST_AT ? colors.red : colors.line}`,
          transform: `translateY(${(1 - card) * 120}px) translateX(${shake}px)`,
        }}
      >
        <div
          style={{
            width: 104,
            height: 104,
            borderRadius: 30,
            background: "rgba(57,208,158,.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width={58} height={58} viewBox="0 0 24 24">
            <path
              d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"
              fill={colors.green}
            />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: colors.mute }}>
            פנייה חדשה · <Num>23:14</Num>
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 800,
              color: colors.text,
              lineHeight: 1.2,
            }}
          >
            אפשר הצעת מחיר לשבוע הבא?
          </div>
        </div>
      </div>

      {frame >= LOST_AT ? (
        <div
          style={{
            ...column,
            top: 1200,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 46,
              fontWeight: 900,
              color: colors.red,
              border: `5px solid ${colors.red}`,
              borderRadius: 20,
              padding: "10px 34px",
              transform: `rotate(-6deg) scale(${1.6 - lost * 0.6})`,
              opacity: lost,
              background: "rgba(255,107,87,.08)",
            }}
          >
            הלקוח הלך למתחרה
          </div>
        </div>
      ) : null}
    </>
  );
};

// ── 2. Why: everything lives somewhere else ────────────────────────────────

const tools = [
  { label: "וואטסאפ", x: 250, y: 580 },
  { label: "אקסל", x: 640, y: 640 },
  { label: "יומן", x: 280, y: 820 },
  { label: "מייל", x: 700, y: 930 },
  { label: "פתקים", x: 230, y: 1110 },
  { label: "מי טיפל בזה?", x: 600, y: 1240 },
];

const Chaos: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <Headline>
        כי הכול מפוזר בין <Accent color={colors.red}>כלים ואנשים</Accent>
      </Headline>
      <svg
        width={WIDTH}
        height={1920}
        style={{ position: "absolute", inset: 0, opacity: 0.6 }}
      >
        {tools.slice(1).map((t, i) => {
          const a = tools[i];
          const show = interpolate(frame, [20 + i * 6, 30 + i * 6], [0, 1], clamp);
          return (
            <line
              key={t.label}
              x1={a.x}
              y1={a.y}
              x2={a.x + (t.x - a.x) * show}
              y2={a.y + (t.y - a.y) * show}
              stroke={colors.red}
              strokeWidth={3}
              strokeDasharray="10 14"
              strokeDashoffset={-frame * 2}
            />
          );
        })}
      </svg>
      {tools.map((t, i) => (
        <Chip key={t.label} {...t} index={i} />
      ))}
    </>
  );
};

const Chip: React.FC<{ label: string; x: number; y: number; index: number }> = ({
  label,
  x,
  y,
  index,
}) => {
  const frame = useCurrentFrame();
  const pop = usePop(index * 5, 9);
  const jx = Math.sin(frame / 7 + index * 1.7) * 14;
  const jy = Math.cos(frame / 9 + index) * 14;
  const tilt = Math.sin(frame / 11 + index) * 6;
  const question = label.endsWith("?");
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) translate(${jx}px, ${jy}px) rotate(${tilt}deg) scale(${pop})`,
        ...panel,
        borderRadius: 26,
        padding: "20px 34px",
        fontSize: 46,
        fontWeight: 800,
        whiteSpace: "nowrap",
        color: question ? colors.red : colors.text,
        border: `2px solid ${question ? colors.red : colors.line}`,
      }}
    >
      {label}
    </div>
  );
};

// ── 3. The fix: one operating layer, the process runs the work ─────────────

const steps = [
  { title: "פנייה חדשה", sub: "ליד · 23:14", who: "לקוח" },
  { title: "מענה ומשימה", sub: "תשובה מיידית, נפתחה משימה", who: "אוטומטי" },
  { title: "הצעה ותיאום", sub: "הצעת מחיר וקביעת מועד", who: "אתה" },
  { title: "ביצוע", sub: "התהליך מתקדם לפי השלבים", who: "צוות" },
  { title: "גבייה", sub: "חשבונית ותזכורת", who: "אוטומטי" },
  { title: "מעקב וחזרה", sub: "בקשת המלצה, לקוח חוזר", who: "אוטומטי" },
];
const STEP = 132;
const PULSE_FROM = 40;
const PULSE_TO = 130;

const Flow: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(
    frame,
    [PULSE_FROM, PULSE_TO],
    [0, steps.length - 1],
    clamp,
  );
  const railTop = 30;
  const railHeight = STEP * (steps.length - 1);
  return (
    <>
      <Headline until={70}>
        מחברים הכול ל<Accent>שכבת תפעול אחת</Accent>
      </Headline>
      <Headline from={72}>
        <Accent>שום דבר</Accent> לא נופל בין הכיסאות
      </Headline>
      <div style={{ ...column, top: 580, height: STEP * steps.length }}>
        <div
          style={{
            position: "absolute",
            right: 47,
            top: railTop + 30,
            width: 6,
            height: railHeight,
            borderRadius: 3,
            background: colors.line,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 47,
            top: railTop + 30,
            width: 6,
            height: (railHeight * pulse) / (steps.length - 1),
            borderRadius: 3,
            background: colors.cyan,
            boxShadow: `0 0 24px ${colors.cyan}`,
          }}
        />
        {steps.map((s, i) => (
          <StepRow key={s.title} index={i} lit={pulse >= i - 0.05} {...s} />
        ))}
      </div>
    </>
  );
};

const StepRow: React.FC<{
  index: number;
  title: string;
  sub: string;
  who: string;
  lit: boolean;
}> = ({ index, title, sub, who, lit }) => {
  const enter = usePop(4 + index * 5, 14);
  const auto = who === "אוטומטי";
  return (
    <div
      style={{
        position: "absolute",
        top: index * STEP,
        left: 0,
        right: 0,
        height: STEP - 20,
        display: "flex",
        alignItems: "center",
        gap: 22,
        opacity: enter,
        transform: `translateX(${(1 - enter) * -120}px)`,
      }}
    >
      <div
        style={{
          width: 100,
          display: "flex",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: lit ? colors.cyan : colors.panel2,
            border: `4px solid ${lit ? colors.cyan2 : colors.line}`,
            boxShadow: lit ? `0 0 30px ${colors.cyan}` : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {lit ? (
            <svg width={24} height={24} viewBox="0 0 24 24">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke={colors.bg}
                strokeWidth={3.4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </div>
      </div>
      <div
        style={{
          ...panel,
          flex: 1,
          height: "100%",
          borderRadius: 26,
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          gap: 18,
          border: `2px solid ${lit ? "rgba(4,216,232,.55)" : colors.line}`,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: colors.text }}>
            {title}
          </div>
          <div style={{ fontSize: 27, fontWeight: 500, color: colors.mute }}>
            {sub.includes("23:14") ? (
              <>
                ליד · <Num>23:14</Num>
              </>
            ) : (
              sub
            )}
          </div>
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            padding: "8px 18px",
            borderRadius: 14,
            color: auto ? colors.bg : colors.cyan2,
            background: auto ? colors.green : "rgba(4,216,232,.12)",
          }}
        >
          {who}
        </div>
      </div>
    </div>
  );
};

// ── 4. End card ────────────────────────────────────────────────────────────

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const mark = usePop(0, 11);
  const name = usePop(8, 13);
  const line = usePop(16, 14);
  const cta = usePop(26, 12);
  const foot = usePop(36, 14);
  const glow = 0.5 + Math.sin(frame / 6) * 0.5;
  const rise = (p: number) => ({
    opacity: p,
    transform: `translateY(${(1 - p) * 40}px)`,
  });
  return (
    <div
      style={{
        position: "absolute",
        top: 330,
        left: 96,
        width: WIDTH - 192,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div style={{ transform: `scale(${mark}) rotate(${(1 - mark) * -30}deg)` }}>
        <Mark size={260} />
      </div>
      <div
        dir="ltr"
        style={{
          ...rise(name),
          marginTop: 30,
          fontSize: 130,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        <span style={{ color: colors.text }}>ORT</span>
        <span style={{ color: colors.green }}>-TECH</span>
      </div>
      <div
        style={{
          ...rise(line),
          marginTop: 40,
          fontSize: 52,
          fontWeight: 800,
          color: colors.text,
          lineHeight: 1.25,
        }}
      >
        מערכות תפעול שמתחילות מהעסק.
        <br />
        <Accent>לא מהתוכנה.</Accent>
      </div>
      <div
        style={{
          ...rise(cta),
          marginTop: 56,
          fontSize: 44,
          fontWeight: 900,
          color: colors.bg,
          background: `linear-gradient(90deg, ${colors.cyan}, ${colors.cyan2})`,
          borderRadius: 24,
          padding: "26px 44px",
          boxShadow: `0 0 ${30 + glow * 40}px rgba(4,216,232,${0.35 + glow * 0.25})`,
        }}
      >
        שיחת אבחון · <Num>20</Num> דקות · ללא עלות
      </div>
      <div
        style={{
          ...rise(foot),
          marginTop: 40,
          display: "flex",
          gap: 22,
          alignItems: "center",
          fontSize: 34,
          fontWeight: 700,
          color: colors.mute,
        }}
      >
        <span dir="ltr" style={{ color: colors.text }}>
          ort-tech.co.il
        </span>
        <span>·</span>
        <span>עסק של מילואימניק</span>
      </div>
    </div>
  );
};

// ── Assembly ───────────────────────────────────────────────────────────────

export const OT01LeadAt2314: React.FC = () => (
  <AbsoluteFill style={{ fontFamily, direction: "rtl", color: colors.text }}>
    <Backdrop />
    <Sequence from={beats.lead.from} durationInFrames={beats.lead.duration}>
      <Shot duration={beats.lead.duration}>
        <Lead />
      </Shot>
    </Sequence>
    <Sequence from={beats.chaos.from} durationInFrames={beats.chaos.duration}>
      <Shot duration={beats.chaos.duration}>
        <Chaos />
      </Shot>
    </Sequence>
    <Sequence from={beats.flow.from} durationInFrames={beats.flow.duration}>
      <Shot duration={beats.flow.duration}>
        <Flow />
      </Shot>
    </Sequence>
    <Sequence from={beats.end.from} durationInFrames={beats.end.duration}>
      <EndCard />
    </Sequence>
  </AbsoluteFill>
);
