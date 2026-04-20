import { useState, useRef, type ReactNode } from "react";

interface TooltipProps {
  text: string;
  children: ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top - 4 });
    timeout.current = setTimeout(() => setShow(true), 400);
  };

  const handleLeave = () => {
    clearTimeout(timeout.current);
    setShow(false);
  };

  return (
    <span onMouseEnter={handleEnter} onMouseLeave={handleLeave} className="inline-flex">
      {children}
      {show && (
        <span
          className="fixed z-[100] px-2 py-1 rounded bg-wo-text text-wo-bg text-[10px] font-medium whitespace-nowrap pointer-events-none"
          style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%)" }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
