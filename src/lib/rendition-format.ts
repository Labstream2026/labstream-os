export type RenditionFormat = { key: string; label: string };

export const RENDITION_FORMATS: RenditionFormat[] = [
  { key: "INSTAGRAM_REEL", label: "Instagram Reel" },
  { key: "TIKTOK", label: "TikTok" },
  { key: "YT_SHORTS", label: "YouTube Shorts" },
  { key: "WEB", label: "Web / Landing" },
  { key: "STREAMING", label: "Grabación de streaming" },
  { key: "OTRO", label: "Otro" },
];

export const RENDITION_FORMAT_KEYS: string[] = RENDITION_FORMATS.map((f) => f.key);

export function renditionFormatLabel(key: string): string {
  return RENDITION_FORMATS.find((f) => f.key === key)?.label ?? key;
}
