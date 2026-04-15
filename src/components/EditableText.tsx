import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EditableTextProps {
  value: string;
  completed?: boolean;
  onSave: (value: string) => void;
  className?: string;
}

export function EditableText({ value, completed, onSave, className }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setText(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <Input
        ref={inputRef}
        className={cn("h-7", className)}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (text !== value) onSave(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setEditing(false); if (text !== value) onSave(text); }
          if (e.key === "Escape") { setEditing(false); setText(value); }
        }}
      />
    );
  }

  return (
    <span
      className={cn(
        "truncate cursor-default select-none px-2 py-1 rounded hover:bg-muted/50 transition-colors",
        completed && "line-through text-muted-foreground",
        className,
      )}
      onDoubleClick={() => setEditing(true)}
      title="Dubbelklicka för att redigera"
    >
      {value || "—"}
    </span>
  );
}
