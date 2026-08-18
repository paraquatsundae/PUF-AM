/**
 * Local plugin package discovery (repo `plugins/` folder).
 * Workshop / desktop hub only — Cloud Run has no operator drop folder.
 */
import type { Express, Request, Response } from 'express';
import { resolve } from 'node:path';
import {
  defaultPluginsRoot,
  listUnpackedPluginPackages,
} from './listPluginPackages.ts';

function pluginsRootFromCwd(): string {
  return defaultPluginsRoot(resolve(process.cwd()));
}

export function registerPluginPackageRoutes(app: Express): void {
  app.get('/api/plugins/packages', (_req: Request, res: Response) => {
    try {
      const root = pluginsRootFromCwd();
      const packages = listUnpackedPluginPackages(root).map(({ manifest, dirName }) => ({
        ...manifest,
        dirName,
      }));
      res.json({
        root: 'plugins',
        packages,
      });
    } catch (error) {
      console.error('[plugins] list failed:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list plugin packages',
      });
    }
  });
}
