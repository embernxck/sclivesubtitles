"use client";

/**
 * Ввод текста. Принимает и простыню, и готовый LRC — разбираться будет сервер.
 */

import { useState } from "react";
import { isLrc, linesFromPlain } from "@/lib/lrc";

type Props = {
  initial?: string;
  authorName: string;
  onAuthorNameChange: (name: string) => void;
  onCancel: () => void;
  onSave: (content: string) => Promise<void>;
  saving: boolean;
};

export function TextEntry({
  initial = "",
  authorName,
  onAuthorNameChange,
  onCancel,
  onSave,
  saving,
}: Props) {
  const [content, setContent] = useState(initial);

  const alreadySynced = isLrc(content);
  const lineCount = alreadySynced ? 0 : linesFromPlain(content).filter((line) => line.text).length;

  return (
    <div className="stack">
      <div>
        <h2>Текст песни</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Вставь текст как есть — по строке на строку. Пустая строка между
          куплетами станет проигрышем. Пометки вроде «[Припев]» уберём сами.
          Если у тебя уже готовый <code>.lrc</code> с метками — его тоже можно
          вставить сюда.
        </p>
      </div>

      <textarea
        className="field"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={"первая строка\nвторая строка\n\nстрока после проигрыша"}
        spellCheck={false}
        autoFocus
      />

      <div className="row">
        <input
          className="field"
          style={{ maxWidth: 260 }}
          value={authorName}
          onChange={(event) => onAuthorNameChange(event.target.value)}
          placeholder="Как подписать (необязательно)"
          maxLength={60}
        />
        <span className="spacer" />
        <span className="muted small">
          {alreadySynced ? "Вижу готовые метки времени" : `Строк: ${lineCount}`}
        </span>
      </div>

      <div className="row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || content.trim().length === 0}
          onClick={() => void onSave(content)}
        >
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Отмена
        </button>
      </div>
    </div>
  );
}
