/**
 * Mounts Freenet Hot-watch while a farm session is open. Renders nothing.
 */
import { useAuth } from '../contexts/AuthContext';
import { useFreenetHotWatch } from '../hooks/useFreenetHotWatch';

export function FreenetHotWatchHost() {
  const { userData } = useAuth();
  useFreenetHotWatch(userData?.farmId);
  return null;
}
