import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MultiTagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  ariaLabel: string;
  validateItem?: (value: string) => string | undefined;
  className?: string;
  disabled?: boolean;
  helperText?: string;
}

export function MultiTagInput({
  values,
  onChange,
  placeholder = '输入后按 Enter 添加',
  ariaLabel,
  validateItem,
  className,
  disabled,
  helperText,
}: MultiTagInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();

  const addMany = (raw: string) => {
    const incoming = raw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (incoming.length === 0) {
      setDraft('');
      setError(undefined);
      return;
    }

    for (const item of incoming) {
      const itemError = validateItem?.(item);
      if (itemError) {
        setError(itemError);
        return;
      }
    }

    const next = [...values];
    const seen = new Set(values);
    for (const item of incoming) {
      if (!seen.has(item)) {
        seen.add(item);
        next.push(item);
      }
    }
    onChange(next);
    setDraft('');
    setError(undefined);
  };

  const remove = (value: string) => onChange(values.filter((item) => item !== value));

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 transition-colors',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40',
          error && 'border-destructive focus-within:border-destructive focus-within:ring-destructive/20',
          disabled && 'opacity-50',
        )}
      >
        {values.map((value) => (
          <span key={value} className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-foreground">
            <span className="truncate">{value}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => remove(value)}
              className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
              aria-label={`移除 ${value}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          disabled={disabled}
          aria-label={ariaLabel}
          placeholder={values.length === 0 ? placeholder : '继续添加…'}
          className="min-w-[9rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addMany(draft);
            } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) addMany(draft);
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            if (!text.includes('\n') && !text.includes('\r')) return;
            event.preventDefault();
            addMany(text);
          }}
        />
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
