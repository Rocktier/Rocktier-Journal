import { t } from "../i18n";

interface Props {
  selected: string | null;
  onSelect: (mood: string | null) => void;
}

const MOODS = [
  { key: "happy", emoji: "😀" },
  { key: "neutral", emoji: "😐" },
  { key: "sad", emoji: "😢" },
  { key: "angry", emoji: "😡" },
  { key: "tired", emoji: "😴" },
  { key: "custom", emoji: "❓" },
];

export default function MoodPicker({ selected, onSelect }: Props) {
  return (
    <div className="mood-picker">
      {MOODS.map((m) => (
        <button
          key={m.key}
          className={`mood-btn ${selected === m.key ? "active" : ""}`}
          onClick={() => onSelect(selected === m.key ? null : m.key)}
          title={t("mood." + m.key)}
        >
          {m.emoji}
        </button>
      ))}
    </div>
  );
}
