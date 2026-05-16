import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';

/** Renders relative time only on the client (avoids hydration mismatch) */
export function RelativeTime({ iso, className }) {
  const [v, setV] = useState(null);
  
  useEffect(() => {
    const update = () => setV(formatDistanceToNow(new Date(iso), { addSuffix: true }));
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [iso]);
  
  return (
    <span suppressHydrationWarning className={className}>
      {v ?? format(new Date(iso), 'MMM d')}
    </span>
  );
}

/** Renders a formatted date only on the client */
export function ClientDate({ iso, fmt = 'MMM d', className }) {
  const [v, setV] = useState(null);
  
  useEffect(() => setV(format(new Date(iso), fmt)), [iso, fmt]);
  
  return (
    <span suppressHydrationWarning className={className}>
      {v ?? '…'}
    </span>
  );
}