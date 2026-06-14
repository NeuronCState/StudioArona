import { useConnectionStore, type ConnectionMode } from '@/stores/connection';

const CLOUD_LLM = 'MiniMax-M2.7';
const CLOUD_TTS = 'MiniMax TTS';
const LOCAL_LLM = 'Fun-Audio-Chat-8B';
const LOCAL_TTS = 'CosyVoice3-0.5B';

export function ConnectionStatusSlider() {
  const userMode = useConnectionStore((s) => s.userMode);
  const serverStatus = useConnectionStore((s) => s.serverStatus);
  const setUserMode = useConnectionStore((s) => s.setUserMode);

  const showServerIndicator = userMode === 'auto';
  const isOnline = userMode === 'auto' ? serverStatus !== 'offline' : userMode === 'online';

  const handleToggle = () => {
    const next: ConnectionMode =
      userMode === 'auto' ? 'offline' : userMode === 'offline' ? 'online' : 'auto';
    setUserMode(next);
  };

  const modeLabel =
    userMode === 'auto'
      ? serverStatus === 'online'
        ? 'Online'
        : serverStatus === 'offline'
          ? 'Offline'
          : '...'
      : userMode === 'online'
        ? 'Online'
        : 'Offline';

  const dotColor = isOnline ? '#22c55e' : '#ef4444';

  return (
    <div className="flex items-center gap-2">
      {/* Track */}
      <div
        onClick={handleToggle}
        className="relative flex h-8 w-[340px] cursor-pointer items-center rounded-full border transition-colors select-none"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        {/* Left side — Online models */}
        <div className="absolute left-3 flex flex-col text-[9px] leading-tight opacity-50">
          <span style={{ color: isOnline ? '#22c55e' : undefined }}>{CLOUD_LLM}</span>
          <span style={{ color: isOnline ? '#22c55e' : undefined }}>{CLOUD_TTS}</span>
        </div>

        {/* Right side — Offline models */}
        <div className="absolute right-3 flex flex-col text-[9px] leading-tight text-right opacity-50">
          <span style={{ color: !isOnline ? '#ef4444' : undefined }}>{LOCAL_LLM}</span>
          <span style={{ color: !isOnline ? '#ef4444' : undefined }}>{LOCAL_TTS}</span>
        </div>

        {/* Knob */}
        <div
          className="absolute flex h-7 w-[100px] items-center justify-center gap-1.5 rounded-full text-[11px] font-medium shadow transition-all duration-300"
          style={{
            left: isOnline ? '3px' : 'calc(100% - 103px)',
            background: isOnline ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${isOnline ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: isOnline ? '#22c55e' : '#ef4444',
          }}
        >
          {/* Dot */}
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
          />
          {modeLabel}
        </div>
      </div>

      {/* Auto indicator */}
      {showServerIndicator && (
        <span className="text-[10px] text-[var(--color-text-muted)]">auto</span>
      )}
    </div>
  );
}
