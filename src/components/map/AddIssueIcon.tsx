import { Plus } from '@phosphor-icons/react';
import { cn } from '../../lib/utils';

/**
 * Phosphor-style alert triangle (MIT) with a plus — larger mark for soft keys.
 * Triangle path from Phosphor Warning (duotone base, without the bang).
 * @see https://phosphoricons.com/
 */
export function AddIssueIcon({
  className,
  size = 22,
}: {
  className?: string;
  size?: number;
}) {
  const plusSize = Math.round(size * 0.4);

  return (
    <span
      className={cn(
        'pufom-map-icon relative inline-flex items-center justify-center shrink-0 text-current',
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        width={size}
        height={size}
        fill="currentColor"
        className="absolute inset-0 block"
        style={{ maxWidth: 'none', maxHeight: 'none' }}
      >
        <path d="M215.46,216H40.54C27.92,216,20,202.79,26.13,192.09L113.59,40.22c6.3-11,22.52-11,28.82,0l87.46,151.87C236,202.79,228.08,216,215.46,216Z" />
      </svg>
      <Plus
        weight="bold"
        color="#fff"
        size={plusSize}
        className="relative block"
        style={{ marginTop: size * 0.12, maxWidth: 'none', maxHeight: 'none' }}
      />
    </span>
  );
}
