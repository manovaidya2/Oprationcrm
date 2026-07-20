import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Builds a compact page list like: 1 2 3 4 5 ... 10  or  1 ... 4 5 6 ... 20
function buildPageList(current, total) {
  const pages = [];
  const add = (p) => { if (!pages.includes(p)) pages.push(p); };

  add(1);
  for (let p = current - 1; p <= current + 1; p++) {
    if (p > 1 && p < total) add(p);
  }
  add(total);

  // Insert '…' markers where there are gaps
  const withGaps = [];
  let prev = null;
  for (const p of pages.sort((a, b) => a - b)) {
    if (prev !== null && p - prev > 1) withGaps.push('…');
    withGaps.push(p);
    prev = p;
  }
  return withGaps;
}

// Numbered pagination bar with Prev/Next + a "go to page" input.
export function PagerBar({ page, pages, total, onPage, loading }) {
  const [jumpVal, setJumpVal] = useState('');

  useEffect(() => { setJumpVal(''); }, [page]);

  if (pages <= 1) return null;

  function goToJump() {
    const n = parseInt(jumpVal, 10);
    if (!n || n < 1 || n > pages) return;
    onPage(n);
  }

  const pageList = buildPageList(page, pages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{total} total</span>

      <div className="flex items-center gap-1 flex-wrap">
        <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page <= 1 || loading}
          onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5"/>
        </Button>

        {pageList.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <Button
              key={p}
              size="sm"
              variant={p === page ? 'default' : 'outline'}
              className={`h-7 w-7 p-0 text-xs ${p === page ? '' : 'text-slate-600'}`}
              disabled={loading}
              onClick={() => onPage(p)}
            >
              {p}
            </Button>
          )
        )}

        <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page >= pages || loading}
          onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-3.5 w-3.5"/>
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Go to</span>
        <Input
          type="number"
          min={1}
          max={pages}
          value={jumpVal}
          onChange={e => setJumpVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && goToJump()}
          placeholder={String(page)}
          className="h-7 w-16 text-xs px-2"
        />
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={loading} onClick={goToJump}>
          Go
        </Button>
      </div>
    </div>
  );
}