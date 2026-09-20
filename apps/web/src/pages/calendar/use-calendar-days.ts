import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getCalendarView } from "@/api";
import type { CalendarDateCell } from "@/components/flaremo-calendar";
import { buildMonthGrid, type WeekStart } from "@/lib/calendar-date";

/**
 * Data layer of the month view: the calendar aggregate for the visible grid
 * window (gridStart..gridEnd), the per-day map it folds into, and the totals
 * the header subtitle shows. The grid keys come from the same builder the
 * calendar renders, so the query window always covers what is on screen.
 */
export function useCalendarDays({
  monthKey,
  weekStart,
}: {
  monthKey: string;
  weekStart: WeekStart;
}) {
  const grid = useMemo(
    () => buildMonthGrid(monthKey, weekStart),
    [monthKey, weekStart],
  );
  const gridStart = grid[0].key;
  const gridEnd = grid[grid.length - 1].key;

  const timeZoneOffset = useMemo(() => new Date().getTimezoneOffset(), []);

  const calendarQuery = useQuery({
    queryKey: ["calendar", gridStart, gridEnd, timeZoneOffset],
    queryFn: () =>
      getCalendarView({ from: gridStart, to: gridEnd, tz: timeZoneOffset }),
  });

  const data = useMemo(() => {
    const map = new Map<string, CalendarDateCell>();
    const ensure = (key: string) => {
      let cell = map.get(key);
      if (!cell) {
        cell = { notes: 0, note_tasks: 0, tasks: [] };
        map.set(key, cell);
      }
      return cell;
    };
    for (const note of calendarQuery.data?.notes ?? []) {
      ensure(note.date).notes = note.count;
    }
    for (const noteTask of calendarQuery.data?.note_tasks ?? []) {
      ensure(noteTask.date).note_tasks = noteTask.count;
    }
    for (const task of calendarQuery.data?.tasks ?? []) {
      if (!task.due_at) continue;
      ensure(task.due_at).tasks.push(task);
    }
    return map;
  }, [calendarQuery.data]);

  const monthStats = useMemo(() => {
    const monthPrefix = `${monthKey}-`;
    let notes = 0;
    let tasks = 0;
    for (const [key, cell] of data.entries()) {
      if (key.startsWith(monthPrefix)) {
        notes += cell.notes;
        tasks += cell.tasks.length;
      }
    }
    return { notes, tasks };
  }, [data, monthKey]);

  return { calendarQuery, data, monthStats };
}
