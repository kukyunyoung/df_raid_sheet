import { type ComponentProps, type ReactNode, useEffect } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cx(
        'rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10',
        className,
      )}
      {...props}
    />
  )
}

/** 카드 상단의 작은 강조 라벨 (레퍼런스의 "Performance" 위치) */
export function Eyebrow({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cx('text-sm font-semibold text-indigo-600 dark:text-indigo-400', className)}
      {...props}
    />
  )
}

type ButtonProps = ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'danger' }

export function Button({ variant = 'secondary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold',
        'transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500',
        variant === 'secondary' &&
          'bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20',
        variant === 'danger' &&
          'text-red-600 ring-1 ring-red-200 hover:bg-red-50 dark:text-red-400 dark:ring-red-500/30 dark:hover:bg-red-500/10',
        className,
      )}
      {...props}
    />
  )
}

export const inputClass =
  'block rounded-lg bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-300 ' +
  'placeholder:text-gray-400 focus:outline-2 focus:outline-indigo-600 ' +
  'dark:bg-white/5 dark:text-white dark:ring-white/10'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <div className="*:w-full">{children}</div>
    </label>
  )
}

export function Modal({
  open, onClose, title, children, dismissable = true,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  dismissable?: boolean
}) {
  useEffect(() => {
    if (!open || !dismissable) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissable, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-gray-950/40 backdrop-blur-sm"
        onClick={dismissable ? onClose : undefined}
      />
      <Card className="relative max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <div className="mt-4">{children}</div>
      </Card>
    </div>
  )
}
