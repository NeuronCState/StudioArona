import { useNavigate } from 'react-router-dom';
import { Calendar } from 'lucide-react';

interface ScheduleEvent {
  id: string;
  title: string;
  time: string;
  isPast: boolean;
  isCurrent: boolean;
}

export function ScheduleTile({ events }: { events: ScheduleEvent[] }) {
  const navigate = useNavigate();
  const count = events.length;

  return (
    <div className="studio-tile h-full" onClick={() => navigate('/schedule')}>
      <div className="studio-tile-inner tile-anim-1">
        <div className="studio-tile-header">
          <h3>
            <Calendar size={15} className="text-amber-500" />
            Schedule
          </h3>
        </div>

        {count === 0 ? (
          <div className="tile-empty">
            <Calendar size={28} className="mb-1 opacity-30" />
            <span className="text-xs">No events today</span>
          </div>
        ) : (
          <div className="flex flex-1 flex-col min-h-0">
            <div className="flex-1 space-y-0.5">
              {events.map((event) => (
                <div key={event.id} className="schedule-item">
                  <span className={`schedule-dot ${event.isCurrent ? 'current' : event.isPast ? 'past' : 'upcoming'}`} />
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-medium text-stone-400 tabular-nums">{event.time}</span>
                    <p className="truncate text-[13px] font-medium text-stone-700">{event.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="schedule-footer">
          {count === 0 ? 'No events today' : `${count} event${count > 1 ? 's' : ''} today`}
        </div>
      </div>
    </div>
  );
}
