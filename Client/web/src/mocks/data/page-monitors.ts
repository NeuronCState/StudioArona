interface PageMonitor {
  id: string;
  user_id: string;
  url: string;
  label: string;
  css_selector: string;
  last_hash: string | null;
  last_checked_at: string | null;
  last_changed_at: string | null;
  check_interval_min: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const mockPageMonitors: PageMonitor[] = [];
