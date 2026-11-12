import { useEffect, useRef, useState } from 'react';
import type { Day } from '../types';
import { DAYS, HOURS } from '../data/seed';
import { fmtHour } from '../lib/format';

interface Props {
  value: string[];
  onChange?: (next: string[]) => void;
  /** Optional window to outline, e.g. the student's requested time. */
  highlight?: { day: Day; start: number; end: number };
  /** Optional second availability to show as overlap (e.g. student's own free time). */
  compare?: string[];
}

/** Weekly recurring availability (M2). Click or drag across cells to toggle hours. */
export function AvailabilityGrid({ value, onChange, highlight, compare }: Props) {
  const editable = !!onChange;
  const set = new Set(value);
  const cmp = compare ? new Set(compare) : null;
  const [drag, setDrag] = useState<null | boolean>(null);
  const touched = useRef<Set<string>>(new Set());

  useEffect(() => {
    const up = () => { setDrag(null); touched.current.clear(); };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const apply = (key: string, on: boolean) => {
    if (!onChange || touched.current.has(key)) return;
    touched.current.add(key);
    const next = new Set(set);
    on ? next.add(key) : next.delete(key);
    onChange([...next]);
  };

  return (
    <div className={`availgrid ${editable ? 'editable' : ''}`} role="grid" aria-label="Weekly availability">
      <div className="ag-corner" />
      {DAYS.map(d => <div key={d} className="ag-day" role="columnheader">{d}</div>)}
      {HOURS.map(h => (
        <div className="ag-row" key={h} role="row">
          <div className="ag-hour">{fmtHour(h)}</div>
          {DAYS.map(d => {
            const key = `${d}-${h}`;
            const on = set.has(key);
            const inWindow = highlight && highlight.day === d && h >= highlight.start && h < highlight.end;
            const both = cmp && on && cmp.has(key);
            return (
              <div
                key={key}
                role="gridcell"
                aria-selected={on}
                aria-label={`${d} ${fmtHour(h)} ${on ? 'available' : 'unavailable'}`}
                tabIndex={editable ? 0 : -1}
                className={`ag-cell ${on ? 'on' : ''} ${both ? 'both' : ''} ${inWindow ? 'window' : ''}`}
                onPointerDown={e => { if (!editable) return; e.preventDefault(); setDrag(!on); apply(key, !on); }}
                onPointerEnter={() => { if (drag !== null) apply(key, drag); }}
                onKeyDown={e => { if (editable && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); touched.current.clear(); apply(key, !on); } }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
