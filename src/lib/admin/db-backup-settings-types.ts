export type DbBackupIncludedTables = Record<string, boolean>;

export type DbBackupSettingsDto = {
  enabled: boolean;
  intervalHours: number;
  webdavUrl: string;
  webdavUsername: string;
  webdavPasswordSet: boolean;
  remoteFolder: string;
  maxFileBytes: number;
  includedTables: DbBackupIncludedTables;
  lastAutoRunAt: string | null;
  nextAutoRunAt: string | null;
  runRequestedAt: string | null;
  configured: boolean;
  updatedAt: string;
};
