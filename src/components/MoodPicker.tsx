import { useState } from "react";

interface Props {
  selected: string | null;
  onSelect: (mood: string | null) => void;
}

const MOODS = [
  { key: "happy", emoji: "😀", label: "Happy" },
  { key: "neutral", emoji: "😐", label: "Neutral" },
  { key: "sad", emoji: "😢", label: "Sad" },
  { key: "angry", emoji: "😡", label: "Angry" },
  { key: "tired", emoji: "😴", label: "Tired" },
  { key: "custom", emoji: "❓", label: "Custom" },
];

export default function MoodPicker({ selected, onSelect }: Props) {
  return (
    <div className="mood-picker">
      {MOODS.map((m) => (
        <button
          key={m.key}
          className={`mood-btn ${selected === m.key ? "active" : ""}`}
          onClick={() => onSelect(selected === m.key ? null : m.key)}
          title={m.label}
        >
          {m.emoji}
        </button>
      ))}
    </div>
  );
}
