// Bundled locally so renders don't depend on reaching Google Fonts.
import "@fontsource-variable/heebo";

// Same palette as public/site.css and the ORT-TECH mark (public/ort-tech-mark.svg).
export const colors = {
  bg: "#020812",
  panel: "#0a1625",
  panel2: "#0c1a2c",
  navy: "#071c45",
  blue: "#0752b8",
  cyan: "#04d8e8",
  cyan2: "#69f3f4",
  text: "#f5f9ff",
  mute: "#8fa6bb",
  line: "rgba(93,211,230,.16)",
  red: "#ff6b57",
  green: "#39D09E",
  markDark: "#16202E",
  cream: "#FBF8F3",
};

export const fontFamily = "'Heebo Variable', sans-serif";

// Safe areas for 1080x1920 reels: the union of what Reels, Shorts and TikTok
// cover (after coding-chops' vertical format standard).
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
export const COLUMN = 780;
export const COLUMN_LEFT = (WIDTH - COLUMN) / 2;
