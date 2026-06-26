import { Fira_Sans, Inter, Inter_Tight, Pangolin, Roboto_Condensed, Tektur } from "next/font/google";
import localFont from "next/font/local";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter-tight",
  display: "swap",
});

const tektur = Tektur({
  subsets: ["latin", "cyrillic"],
  variable: "--font-tektur",
  display: "swap",
});

const firaSans = Fira_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fira-sans",
  display: "swap",
});

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin", "cyrillic"],
  variable: "--font-roboto-condensed",
  display: "swap",
});

const pangolin = Pangolin({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-pangolin",
  display: "swap",
});

const morpheus = localFont({
  src: [{ path: "../assets/fonts/Morpheus.woff2", weight: "400", style: "normal" }],
  variable: "--font-morpheus",
  display: "swap",
});

const propaniac = localFont({
  src: [{ path: "../assets/fonts/Propaniac.woff2", weight: "400", style: "normal" }],
  variable: "--font-propaniac",
  display: "swap",
});

const tolkien = localFont({
  src: [{ path: "../assets/fonts/tolkiencyr-webfont.woff2", weight: "400", style: "normal" }],
  variable: "--font-tolkien",
  display: "swap",
});

export const siteFontVariables = [
  inter.variable,
  interTight.variable,
  tektur.variable,
  firaSans.variable,
  robotoCondensed.variable,
  pangolin.variable,
  morpheus.variable,
  propaniac.variable,
  tolkien.variable,
].join(" ");

export const siteFontBodyClassName = siteFontVariables;
