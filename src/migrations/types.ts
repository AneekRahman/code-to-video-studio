export type MigrationChange = {
  file: string;
  description: string;
};

export type MigrationResult = {
  success: boolean;
  changes: MigrationChange[];
  error?: string;
};

export type MigrationContext = {
  studioRoot: string;
  modeDir: string;
  modeId: string;
  dryRun?: boolean;
};

export type MigrationRecipe = {
  fromApi: number;
  toApi: number;
  title: string;
  description: string;
  apply: (ctx: MigrationContext) => Promise<MigrationResult>;
};

export type ModeMigrationReport = {
  mode_id: string;
  from_api: number;
  to_api: number;
  target_api: number;
  status: 'migrated' | 'up_to_date' | 'no_path' | 'failed';
  changes: MigrationChange[];
  error?: string;
};
