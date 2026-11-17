import type { FontPairId } from '@/modules/resume/schema';
/**
 * Plain data about the graphic designs (no React): names, look, signature colour, type and the
 * kinds of work they suit. Shared by the design catalogue, the AI's design choices and ranking.
 */
import type { PresetId } from '@/modules/resume/professions';

export type GraphicFamily = 'spot' | 'band' | 'rail' | 'cover';
export type GraphicMeta = {
  name: string;
  style: string;
  description: string;
  /** For the AI's design choices: words that describe the look. */
  mood: string;
  family: GraphicFamily;
  accent: string;
  fontPair: FontPairId;
  fit: Partial<Record<PresetId, number>>;
};

const creative = { tech: 0.8, student: 0.8, retail: 0.6, general: 0.5 } as const;

export const GRAPHIC_META = {
  neon: {
    name: 'Neon',
    style: 'Graphic spotlight',
    description:
      'A deep navy header with your name set huge, an arched portrait, and a timeline beside your skills.',
    mood: 'graphic, bold dark header, arched photo, big name, key numbers band, teal, creative, education, tech',
    family: 'spot',
    accent: '#00d3c4',
    fontPair: 'bold',
    fit: { ...creative, teacher: 0.8 },
  },
  coral: {
    name: 'Coral',
    style: 'Graphic spotlight',
    description:
      'A plum header with soft light beams and a rounded portrait over its edge. Warm, confident and modern.',
    mood: 'graphic, warm coral and plum, rounded photo, number cards, marketing, sales, strategy',
    family: 'spot',
    accent: '#fc725e',
    fontPair: 'rounded',
    fit: { ...creative, office: 0.6 },
  },
  ocean: {
    name: 'Ocean',
    style: 'Graphic spotlight',
    description:
      'A sea-green header with flowing lines and a round portrait; the side column sits on the left with your contact details and skills.',
    mood: 'graphic, sea green, waves, round photo, left column, calm, operations, logistics, healthcare',
    family: 'spot',
    accent: '#40dad5',
    fontPair: 'modern',
    fit: { ...creative, healthcare: 0.6, driver: 0.5 },
  },
  emerald: {
    name: 'Emerald',
    style: 'Graphic spotlight',
    description:
      'A forest-green header with a dot grid and a leaf-shaped portrait and numbered sections.',
    mood: 'graphic, green, numbered sections, leaf photo, technical type, sustainability, engineering',
    family: 'spot',
    accent: '#63dda1',
    fontPair: 'technical',
    fit: { ...creative, trades: 0.5 },
  },
  magenta: {
    name: 'Magenta',
    style: 'Graphic spotlight',
    description:
      'A berry header with angled blocks and a hexagon portrait and a left side column. Bold and personal.',
    mood: 'graphic, pink and berry, hexagon photo, number cards, bold, content, media, hospitality',
    family: 'spot',
    accent: '#f27dc6',
    fontPair: 'bold',
    fit: { ...creative, retail: 0.8 },
  },
  citrus: {
    name: 'Citrus',
    style: 'Graphic rail',
    description:
      'A dark full-height column with a notched portrait, contact details and skill bars; and a huge two-tone name.',
    mood: 'graphic, dark left column, yellow, notched photo, big name, architecture, engineering, design',
    family: 'band',
    accent: '#f9b632',
    fontPair: 'modern',
    fit: { ...creative, trades: 0.6, office: 0.5 },
  },
  cyber: {
    name: 'Cyber',
    style: 'Graphic rail',
    description:
      'A near-black column with a grid motif and a round portrait; lime highlights and numbered sections. Built for tech.',
    mood: 'graphic, black and lime, tech, developer, grid, numbered sections, technical type',
    family: 'band',
    accent: '#b9fc55',
    fontPair: 'technical',
    fit: { tech: 1, student: 0.7, general: 0.4 },
  },
  ruby: {
    name: 'Ruby',
    style: 'Graphic rail',
    description:
      'A wine-dark column with a tall arched portrait and light stripes; and rose highlights.',
    mood: 'graphic, wine and rose, tall arched photo, pills, motion, media, marketing, creative lead',
    family: 'band',
    accent: '#ff5b84',
    fontPair: 'editorial',
    fit: { ...creative, retail: 0.7 },
  },
  blueprint: {
    name: 'Blueprint',
    style: 'Graphic rail',
    description:
      'A navy column with a slanted portrait and a quiet ring; and sky-blue lines. Precise.',
    mood: 'graphic, navy and sky blue, engineering, civil, architecture, precise, slanted photo',
    family: 'band',
    accent: '#72b6ff',
    fontPair: 'technical',
    fit: { tech: 0.8, trades: 0.7, office: 0.6, general: 0.5 },
  },
  cobalt: {
    name: 'Cobalt',
    style: 'Graphic rail',
    description:
      'A deep blue column with a square framed portrait and a dot field; serif name in two tones. Analytical and calm.',
    mood: 'graphic, cobalt blue, serif name, analytics, data, finance, consulting, square photo',
    family: 'band',
    accent: '#6f9cff',
    fontPair: 'classic',
    fit: { office: 0.8, tech: 0.7, executive: 0.6, general: 0.5 },
  },
  violet: {
    name: 'Violet',
    style: 'Graphic portfolio',
    description:
      'Your portrait fills the top corner beside a lavender panel with your name; a deep violet column with numbered headings and a colour footer.',
    mood: 'graphic, violet and lavender, big photo block, healthcare, clinical, care, numbered column, footer band',
    family: 'rail',
    accent: '#9d77d3',
    fontPair: 'editorial',
    fit: { healthcare: 0.9, teacher: 0.7, ...creative },
  },
  terra: {
    name: 'Terra',
    style: 'Graphic portfolio',
    description:
      'An arched portrait over earth brown, a linen panel with fine lines and a large serif name in two tones. Editorial and warm.',
    mood: 'graphic, earth brown and terracotta, serif, editorial, arched photo, writing, design, hospitality',
    family: 'rail',
    accent: '#dd8664',
    fontPair: 'executive',
    fit: { ...creative, office: 0.6 },
  },
  graphite: {
    name: 'Graphite',
    style: 'Graphic portfolio',
    description:
      'Charcoal and gold: an inset portrait with a gold offset, a framed ivory panel and an elegant serif name. Quiet luxury for senior roles.',
    mood: 'graphic, charcoal and gold, luxury, executive, senior, serif, framed, inset photo',
    family: 'rail',
    accent: '#c5a66a',
    fontPair: 'executive',
    fit: { executive: 0.9, office: 0.7, general: 0.5 },
  },
  tangerine: {
    name: 'Tangerine',
    style: 'Graphic portfolio',
    description:
      'A round portrait on dark brown, an apricot panel with a dot field and a heavy name; orange meters and a footer band. Friendly and bold.',
    mood: 'graphic, orange and brown, round photo, friendly, studio, brand, retail, hospitality',
    family: 'rail',
    accent: '#ff9c54',
    fontPair: 'humanist',
    fit: { ...creative, retail: 0.8 },
  },
  copper: {
    name: 'Copper',
    style: 'Graphic portfolio',
    description:
      'A portrait cut on a slant, a blush panel and a classic serif name in copper; heritage colours with a modern layout for consultants.',
    mood: 'graphic, copper and plum, heritage, classic serif, consultant, slanted photo, law, finance',
    family: 'rail',
    accent: '#d59d73',
    fontPair: 'classic',
    fit: { executive: 0.7, office: 0.7, general: 0.5 },
  },
  electric: {
    name: 'Electric',
    style: 'Graphic cover',
    description:
      'A magazine-cover header with fine diagonal hatching and a tilted, framed portrait; a bright strip carries your contact line.',
    mood: 'graphic, magazine cover, electric blue, tilted photo, designer, creative, tech',
    family: 'cover',
    accent: '#3f9cff',
    fontPair: 'technical',
    fit: { ...creative },
  },
  solar: {
    name: 'Solar',
    style: 'Graphic cover',
    description:
      'Warm umber and gold: sun rays behind a round, ringed portrait, a heavy name and dot meters. Made for research and education.',
    mood: 'graphic, gold and brown, sun rays, round photo, research, science, academic, education',
    family: 'cover',
    accent: '#f4b94c',
    fontPair: 'bold',
    fit: { teacher: 0.8, ...creative, healthcare: 0.5 },
  },
  ultraviolet: {
    name: 'Ultraviolet',
    style: 'Graphic cover',
    description:
      'An indigo cover with a fine grid and a diamond-cut portrait; lilac highlights, numbered sections and a left side column. Futuristic.',
    mood: 'graphic, indigo and lilac, grid, diamond photo, futuristic, AI, engineering, tech',
    family: 'cover',
    accent: '#9c83ff',
    fontPair: 'technical',
    fit: { tech: 0.9, student: 0.7, general: 0.4 },
  },
  aurora: {
    name: 'Aurora',
    style: 'Graphic cover',
    description:
      'Deep teal with soft bubbles and a free-form portrait frame; mint highlights and a serif-free, airy body. Calm and digital.',
    mood: 'graphic, teal and mint, bubbles, organic photo frame, digital, UX, research, wellbeing',
    family: 'cover',
    accent: '#58d7aa',
    fontPair: 'rounded',
    fit: { ...creative, healthcare: 0.6 },
  },
  chromatic: {
    name: 'Chromatic',
    style: 'Graphic cover',
    description:
      'Midnight blue with confetti accents and a portrait offset on a pink block; a playful cover for visual artists and storytellers.',
    mood: 'graphic, midnight and pink, confetti, playful, offset photo, artist, illustrator, storyteller',
    family: 'cover',
    accent: '#f5a2dd',
    fontPair: 'modern',
    fit: { ...creative, retail: 0.6 },
  },
} as const satisfies Record<string, GraphicMeta>;
