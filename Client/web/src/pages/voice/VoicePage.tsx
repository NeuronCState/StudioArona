import { useNavigate } from 'react-router-dom';
import { VoiceModeOverlay } from './VoiceModeOverlay';

export function VoicePage() {
  const navigate = useNavigate();

  return <VoiceModeOverlay onClose={() => navigate(-1)} />;
}
