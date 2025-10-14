import { FlagIcon } from '@heroicons/react/24/solid';
import { cn } from '@/lib/utils';

interface IncorrectBadgeProps {
  className?: string;
  titleSuffix?: string;
}

const IncorrectBadge = ({ className, titleSuffix }: IncorrectBadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/60 bg-amber-500/20 text-amber-200 text-[10px] font-semibold uppercase tracking-wide',
      className
    )}
    title={`Marked incorrect${titleSuffix ? ` ${titleSuffix}` : ''}`.trim()}
  >
    <FlagIcon className="w-3 h-3" />
    <span>Incorrect</span>
  </span>
);

export default IncorrectBadge;
