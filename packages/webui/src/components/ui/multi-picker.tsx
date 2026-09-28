import { X } from 'lucide-react';
import { Picker, type PickerOption } from './picker';
import { cn } from '@/lib/utils';

export interface MultiPickerSelectedOption extends PickerOption {
  missing?: boolean;
}

interface MultiPickerProps {
  values: string[];
  selectedOptions: ReadonlyArray<MultiPickerSelectedOption>;
  onChange: (values: string[]) => void;
  options: ReadonlyArray<PickerOption>;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  placeholder?: string;
  validateRaw?: (raw: string) => boolean;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
}

export function MultiPicker({
  values,
  selectedOptions,
  onChange,
  options,
  loading,
  error,
  onRefresh,
  placeholder = '添加…',
  validateRaw,
  ariaLabel,
  className,
  disabled,
  emptyLabel = '尚未选择',
}: MultiPickerProps) {
  const selectedSet = new Set(values);
  const available = options.filter((option) => !selectedSet.has(option.value));

  const add = (value: string) => {
    if (selectedSet.has(value)) return;
    onChange([...values, value]);
  };

  const remove = (value: string) => {
    onChange(values.filter((item) => item !== value));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {selectedOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/45 py-1 pl-1.5 pr-1 text-xs text-foreground',
                option.missing && 'border-warning/40 bg-warning/5',
              )}
            >
              {option.avatar ? (
                <img src={option.avatar} alt="" className="media-outline size-5 shrink-0 rounded-full" />
              ) : (
                <span className="size-5 shrink-0 rounded-full bg-muted" />
              )}
              <span className="min-w-0 truncate">
                <span>{option.label}</span>
                {option.sub && option.sub !== option.label && (
                  <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">{option.sub}</span>
                )}
              </span>
              {option.missing && <span className="shrink-0 text-[10px] text-warning">列表外</span>}
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(option.value)}
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
                aria-label={`移除 ${option.label} ${option.value}`}
                title="移除"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      )}

      <Picker
        value=""
        onChange={add}
        options={available}
        loading={loading}
        error={error}
        onRefresh={onRefresh}
        placeholder={placeholder}
        validateRaw={validateRaw}
        ariaLabel={ariaLabel}
        disabled={disabled}
      />
    </div>
  );
}
