export interface DiaryEntry {
  date: string;           // ISO date "YYYY-MM-DD"
  title?: string;         // optional title
  content: string;        // Markdown text
  mood: string | null;    // mood key
  custom_mood: string | null;
  images: ImageRef[];
  created_at: string;     // ISO timestamp
  updated_at: string;     // ISO timestamp
}

export interface ImageRef {
  id: string;             // UUID
  filename: string;       // original filename
  caption?: string;
}

export type MoodKey = "happy" | "neutral" | "sad" | "angry" | "tired" | "custom";

export const MOODS: Record<MoodKey, { emoji: string; label_en: string; label_zh: string }> = {
  happy:   { emoji: "😀", label_en: "Happy",   label_zh: "开心" },
  neutral: { emoji: "😐", label_en: "Neutral", label_zh: "平静" },
  sad:     { emoji: "😢", label_en: "Sad",     label_zh: "难过" },
  angry:   { emoji: "😡", label_en: "Angry",   label_zh: "生气" },
  tired:   { emoji: "😴", label_en: "Tired",   label_zh: "疲惫" },
  custom:  { emoji: "❓", label_en: "Custom",  label_zh: "自定义" },
};

export interface VaultMeta {
  version: number;
  created_at: string;
  last_accessed: string;
}
