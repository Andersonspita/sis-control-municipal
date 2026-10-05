import {
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  Geist_Mono,
  IBM_Plex_Sans,
  JetBrains_Mono,
  Libre_Franklin,
  Literata,
  Public_Sans,
  Red_Hat_Display,
  Red_Hat_Mono,
  Red_Hat_Text,
  Source_Sans_3,
  Source_Serif_4,
} from "next/font/google";

// Todas as famílias dos seis temas ficam declaradas no <html>; o navegador só baixa os arquivos
// das que o tema ativo usa. Só o tema padrão (Mata e Cobre) é pré-carregado.

// 1 · Institucional
export const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"], preload: false });
export const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false });

// 2 · Verde-petróleo
export const plex = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  preload: false,
});

// 3 · Grafite e âmbar
export const sourceSans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin"], preload: false });
export const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], preload: false });

// 4 · Ameixa e ciano
export const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin", "latin-ext"], preload: false });
export const atkinsonMono = Atkinson_Hyperlegible_Mono({ variable: "--font-atkinson-mono", subsets: ["latin", "latin-ext"], preload: false });

// 5 · Mata e Cobre
export const libreFranklin = Libre_Franklin({ variable: "--font-libre-franklin", subsets: ["latin", "latin-ext"] });
export const literata = Literata({ variable: "--font-literata", subsets: ["latin", "latin-ext"], preload: false });
export const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin", "latin-ext"], preload: false });

// 6 · Bordô e Anil
export const redHatText = Red_Hat_Text({ variable: "--font-rh-text", subsets: ["latin", "latin-ext"], preload: false });
export const redHatDisplay = Red_Hat_Display({ variable: "--font-rh-display", subsets: ["latin", "latin-ext"], preload: false });
export const redHatMono = Red_Hat_Mono({ variable: "--font-rh-mono", subsets: ["latin", "latin-ext"], preload: false });

export const classesFontes = [
  publicSans,
  geistMono,
  plex,
  sourceSans,
  sourceSerif,
  atkinson,
  atkinsonMono,
  libreFranklin,
  literata,
  jetbrains,
  redHatText,
  redHatDisplay,
  redHatMono,
]
  .map((f) => f.variable)
  .join(" ");
