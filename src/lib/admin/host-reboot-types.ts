export type HostRebootBlocker = {
  id: string;
  label: string;
};

export type HostRebootStatus = {
  enabled: boolean;
  canReboot: boolean;
  blockers: HostRebootBlocker[];
  platform: string;
  delayMinutes: number;
  scheduled: boolean;
};
