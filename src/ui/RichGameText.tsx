import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";

interface RichGameTextProps {
  text: string;
  className?: string;
}

export function RichGameText(props: RichGameTextProps): ReactElement {
  const { text, className } = props;
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  return (
    <div className={["ui-rich-text", className].filter(Boolean).join(" ")}>
      {lines.map((line, index) => {
        const isBullet = line.trimStart().startsWith("- ");
        const content = isBullet ? line.trimStart().slice(2) : line;
        return (
          <div
            key={`${index}-${content}`}
            className={`ui-rich-text__line ${isBullet ? "is-bullet" : ""}`}
          >
            {isBullet ? <span className="ui-rich-text__bullet">•</span> : null}
            <span>{renderControlInline(content)}</span>
          </div>
        );
      })}
    </div>
  );
}

function renderControlInline(text: string): ReactNode[] {
  const parts = text.split(/(\[[^\]]+\])/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("[") && part.endsWith("]")) {
      const controlText = part.slice(1, -1).trim();
      if (controlText.includes("|")) {
        return (
          <CyclingControlChip
            key={`${part}-${index}`}
            sequence={controlText}
          />
        );
      }
      return (
        <span key={`${part}-${index}`} className="ui-control-chip">
          {controlText}
        </span>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

interface CyclingControlChipProps {
  sequence: string;
}

function CyclingControlChip(props: CyclingControlChipProps): ReactElement {
  const { sequence } = props;
  const options = useMemo(
    () => sequence.split("|").map((entry) => entry.trim()).filter(Boolean),
    [sequence],
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    if (options.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % options.length);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [options.length, sequence]);

  const activeLabel = options[activeIndex] ?? options[0] ?? sequence;

  return (
    <span className="ui-control-chip ui-control-chip--cycling">
      {activeLabel}
    </span>
  );
}
