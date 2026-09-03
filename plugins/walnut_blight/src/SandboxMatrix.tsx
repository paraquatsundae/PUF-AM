import React, { useMemo, useRef, useEffect } from 'react';
import { cn } from '../../../src/lib/utils';
import { SprayType, ApplicationMethod } from './blightModel';

interface SandboxMatrixProps {
  season: string;
  type: 'spray' | 'irrigation';
  data: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

export function SandboxMatrix({ season, type, data, onChange }: SandboxMatrixProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedMethod, setSelectedMethod] = React.useState<ApplicationMethod>('ground');

  const { grid, monthLabels } = useMemo(() => {
    const [startYearStr, endYearSuffixStr] = season.split('-');
    const startYear = parseInt(startYearStr);
    const fullEndYear = 2000 + parseInt(endYearSuffixStr);

    const startDate = new Date(`${startYear}-07-01T12:00:00Z`);
    const endDate = new Date(`${fullEndYear}-06-30T12:00:00Z`);

    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // We want Mon = 0, ..., Sun = 6
    const getDayIndex = (d: Date) => (d.getUTCDay() + 6) % 7;

    const grid: { date: string | null; month: number | null; day: number | null }[][] = Array.from({ length: 7 }, () => []);
    
    const currentDate = new Date(startDate);
    const startDayIndex = getDayIndex(currentDate);

    // Fill initial empty days
    for (let i = 0; i < startDayIndex; i++) {
      grid[i].push({ date: null, month: null, day: null });
    }

    const monthLabels: { label: string; colIndex: number }[] = [];
    let colIndex = 0;

    while (currentDate <= endDate) {
      const dayIndex = getDayIndex(currentDate);
      const year = currentDate.getFullYear();
      const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dayStr = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;
      const month = currentDate.getMonth();
      const day = currentDate.getUTCDate();

      if (day === 1) {
        monthLabels.push({ label: MONTHS[month >= 6 ? month - 6 : month + 6], colIndex });
      }

      grid[dayIndex].push({ date: dateStr, month, day });

      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      
      if (dayIndex === 6) {
        colIndex++;
      }
    }

    // Fill trailing empty days
    const lastDayIndex = getDayIndex(endDate);
    for (let i = lastDayIndex + 1; i < 7; i++) {
      grid[i].push({ date: null, month: null, day: null });
    }

    return { grid, monthLabels };
  }, [season]);

  // Scroll to current month on mount if viewing current season
  useEffect(() => {
    if (scrollRef.current) {
      const today = new Date();
      const [startYearStr] = season.split('-');
      const startYear = parseInt(startYearStr);
      
      // If today is within the season, scroll roughly to today
      if (today >= new Date(`${startYear}-07-01T00:00:00Z`) && today <= new Date(`${startYear + 1}-06-30T23:59:59Z`)) {
        const diffTime = Math.abs(today.getTime() - new Date(`${startYear}-07-01T00:00:00Z`).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const colIndex = Math.floor(diffDays / 7);
        // Each column is roughly 24px (w-5 + gap-1)
        scrollRef.current.scrollLeft = Math.max(0, (colIndex * 24) - 100);
      }
    }
  }, [season]);

  const handleCellClick = (dateStr: string | null) => {
    if (!dateStr) return;

    const newData = { ...data };
    const currentValue = newData[dateStr];

    if (type === 'spray') {
      // Empty -> Chem -> Bio -> Empty
      if (!currentValue) {
        newData[dateStr] = { type: 'chem', method: selectedMethod };
      } else if (currentValue.type === 'chem') {
        newData[dateStr] = { type: 'bio', method: selectedMethod };
      } else {
        delete newData[dateStr];
      }
    } else {
      // Empty -> Light (6h) -> Heavy (18h) -> Empty
      if (!currentValue) {
        newData[dateStr] = 6;
      } else if (currentValue === 6) {
        newData[dateStr] = 18;
      } else {
        delete newData[dateStr];
      }
    }

    onChange(newData);
  };

  const getCellColor = (dateStr: string | null) => {
    if (!dateStr) return 'bg-transparent';
    
    const value = data[dateStr];
    if (!value) return 'bg-slate-100 hover:bg-slate-200';

    if (type === 'spray') {
      return value.type === 'chem' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600';
    } else {
      return value === 6 ? 'bg-blue-300 hover:bg-blue-400' : 'bg-blue-600 hover:bg-blue-700';
    }
  };

  const getTooltip = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const value = data[dateStr];
    
    if (!value) return date;

    if (type === 'spray') {
      return `${date}: ${value.type === 'chem' ? 'Chemical' : 'Biological'} Spray (${value.method === 'drone' ? 'Drone' : 'Ground Rig'})`;
    } else {
      return `${date}: ${value}h Irrigation`;
    }
  };

  return (
    <div className="w-full">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
          {type === 'spray' ? (
            <>
              <div className="flex items-center gap-4 pr-4 border-r border-slate-200">
                <span className="text-slate-400 uppercase tracking-wider text-[10px]">Method:</span>
                <div className="flex bg-slate-100 p-0.5 rounded-lg">
                  <button 
                    onClick={() => setSelectedMethod('ground')}
                    className={`px-3 py-1 rounded-md transition-all ${selectedMethod === 'ground' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Ground Rig
                  </button>
                  <button 
                    onClick={() => setSelectedMethod('drone')}
                    className={`px-3 py-1 rounded-md transition-all ${selectedMethod === 'drone' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Drone
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-sm bg-slate-100 border border-slate-200"></div> None</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-sm bg-rose-500"></div> Chemical</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-sm bg-emerald-500"></div> Biological</div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-sm bg-slate-100 border border-slate-200"></div> None</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-sm bg-blue-300"></div> Light (6h)</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-sm bg-blue-600"></div> Heavy (18h)</div>
            </>
          )}
        </div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Click cells to toggle</div>
      </div>

      <div className="relative border border-slate-200 rounded-xl bg-white p-4 overflow-hidden">
        <div 
          ref={scrollRef}
          className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
        >
          <div className="inline-flex flex-col min-w-max">
            {/* Month Labels */}
            <div className="flex h-6 relative ml-8">
              {monthLabels.map((m, i) => (
                <div 
                  key={i} 
                  className="absolute text-xs font-medium text-slate-500"
                  style={{ left: `${m.colIndex * 24}px` }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex gap-2">
              {/* Day Labels */}
              <div className="flex flex-col gap-1 pt-0.5">
                {DAYS_OF_WEEK.map((day, i) => (
                  <div key={day} className={cn(
                    "h-5 text-[10px] leading-5 font-bold w-6 text-right pr-1",
                    i % 2 === 0 ? "text-slate-600" : "text-slate-300"
                  )}>
                    {day.charAt(0)}
                  </div>
                ))}
              </div>

              {/* Cells */}
              <div className="flex flex-col gap-1">
                {grid.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex gap-1">
                    {row.map((cell, colIndex) => (
                      <button
                        key={`${rowIndex}-${colIndex}`}
                        onClick={() => handleCellClick(cell.date)}
                        disabled={!cell.date}
                        title={getTooltip(cell.date)}
                        className={cn(
                          "w-5 h-5 shrink-0 rounded-sm transition-colors relative flex items-center justify-center",
                          getCellColor(cell.date),
                          !cell.date ? 'cursor-default' : 'cursor-pointer border border-black/5',
                          cell.day === 1 && "ring-1 ring-slate-400 ring-offset-1"
                        )}
                      >
                        {cell.day && (
                          <span className={cn(
                            "text-[7px] font-bold pointer-events-none",
                            data[cell.date!] ? "text-white" : "text-slate-400"
                          )}>
                            {cell.day}
                          </span>
                        )}
                        {cell.day === 1 && (
                          <div className="absolute -top-0.5 -right-0.5 w-1 h-1 bg-slate-900 rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
