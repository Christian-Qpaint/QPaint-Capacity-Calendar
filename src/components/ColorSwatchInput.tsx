import { cn } from '@/lib/utils'

const SIZE_CLASSES = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
} as const

/** Circular native color-input trigger — opens the OS color picker on click, same as a plain
 * `<input type="color">`, just styled as a recognizable swatch dot instead of the default
 * rectangle. Cross-browser circular styling lives in index.css (`.color-swatch-input`). */
export function ColorSwatchInput({
  value,
  onChange,
  size = 'sm',
  title,
  className,
  onClick,
}: {
  value: string
  onChange: (value: string) => void
  size?: keyof typeof SIZE_CLASSES
  title?: string
  className?: string
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={onClick}
      title={title}
      aria-label={title ?? 'Choose color'}
      className={cn(
        'color-swatch-input shrink-0 cursor-pointer appearance-none rounded-full border border-black/10 p-0 shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none active:scale-95',
        SIZE_CLASSES[size],
        className,
      )}
    />
  )
}
