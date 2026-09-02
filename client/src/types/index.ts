export interface CommitFile {
  filename: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface Commit {
  sha?: string;
  shortSha?: string;
  message?: string;
  subject?: string;
  author?: string;
  stats?: string;
  patch?: string;
  files?: CommitFile[];
}

export interface CommitDiffResponse {
  patch?: string;
  stats?: string;
  files?: CommitFile[];
}

export interface StatusResponse {
  gitLogs: string;
  commits: Commit[];
  detailed: string;
  hasCommitsToday: boolean;
  alreadyGenerated: boolean;
  cache: Record<string, unknown>;
}

export interface Draft {
  aktivitas: string;
  pembelajaran: string;
  kendala: string;
}

export interface GenerateResponse {
  draft: Draft;
  gitLogs: string;
  diffSection?: string;
  commits?: Commit[];
}

export interface GenerateManualResponse {
  draft: Draft;
}

export interface GenerateCombinedResponse {
  draft: Draft;
  gitLogs: string;
  diffSection: string;
}

export interface LogbookEntry extends Draft {
  no: number;
  tanggal: string;
  rowNumber: number;
}

export interface EntriesResponse {
  entries: LogbookEntry[];
}

export interface SettingsResponse {
  repoPath: string;
  persistentSettings?: boolean;
  isVercel?: boolean;
}

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export type GenerateMode = 'commit' | 'manual' | 'combined';

export type TabName = 'generate' | 'history' | 'settings';
