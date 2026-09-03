import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FARM_MODULE_IDS, allFarmModules, resolveFarmEnabledModules } from '../shared/auth/farmModules';
import {
  CROP_PACK_IDS,
  listCropPacks,
  migrateLegacyPacks,
  resolveFarmCropPacks,
} from '../shared/farm/cropPacks';
import { defaultModulesWithoutCropPacks } from '../shared/farm/cropPacks';
import { PACK_UI_REGISTRY, getPackUi } from '../src/packs/registry';

const ROOT = join(__dirname, '..');

function walkTs(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((n): n is string => typeof n === 'string' && /\.(ts|tsx)$/.test(n) && !n.includes('.test.'))
    .map((n) => join(dir, n));
}

function importSpecifiers(text: string): string[] {
  const specs: string[] = [];
  const re = /(?:\bfrom\s+|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) specs.push(m[1]);
  return specs;
}

describe('pack golden set', () => {
  it('every catalog pack has plugin.json, UI registry, modules, and matching primaryPath', () => {
    for (const pack of listCropPacks()) {
      expect(CROP_PACK_IDS).toContain(pack.id);
      const manifestPath = join(ROOT, 'plugins', pack.id, 'plugin.json');
      expect(existsSync(manifestPath), `missing ${manifestPath}`).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        id: string;
        category: string;
        modules: string[];
        primaryPath?: string;
      };
      expect(manifest.id).toBe(pack.id);
      expect(manifest.category).toBe(pack.category);
      expect(manifest.modules).toEqual(pack.modules);
      // All packs finished the Plans/PLUGIN_PACK_LAYOUT.md Phase 1 move, so a
      // pack's code lives with its manifest and nowhere else.
      expect(
        existsSync(join(ROOT, 'plugins', pack.id, 'src', 'index.ts')),
        `no UI registration at plugins/${pack.id}/src/index.ts`
      ).toBe(true);
      expect(
        existsSync(join(ROOT, 'src', 'packs', pack.id, 'index.ts')),
        `src/packs/${pack.id}/index.ts is back — packs register from plugins/<id>/src/`
      ).toBe(false);

      const ui = getPackUi(pack.id);
      expect(ui, `missing PACK_UI_REGISTRY for ${pack.id}`).toBeTruthy();
      for (const moduleId of pack.modules) {
        expect(FARM_MODULE_IDS).toContain(moduleId);
      }
      if (pack.primaryPath) {
        expect(manifest.primaryPath).toBe(pack.primaryPath);
        expect(ui!.navItems.some((n) => n.href === pack.primaryPath)).toBe(true);
        const seg = pack.primaryPath.replace(/^\//, '');
        expect(ui!.routes.some((r) => r.path === seg)).toBe(true);
        expect(ui!.routes.every((r) => pack.modules.includes(r.moduleId))).toBe(true);
      }
    }
    expect(PACK_UI_REGISTRY.map((p) => p.packId).sort()).toEqual([...CROP_PACK_IDS].sort());
  });

  it('does not treat Settings category as the shell menu', () => {
    const water = listCropPacks().find((p) => p.id === 'water')!;
    const harvest = listCropPacks().find((p) => p.id === 'harvest')!;
    const drying = listCropPacks().find((p) => p.id === 'drying')!;
    expect(water.category).toBe('generic');
    expect(getPackUi('water')!.navItems[0]?.groupId).toBe('crop');
    expect(harvest.category).toBe('generic');
    expect(getPackUi('harvest')!.navItems[0]?.groupId).toBe('records');
    expect(drying.category).toBe('crop');
    expect(getPackUi('drying')!.navItems[0]?.groupId).toBe('crop');
  });
});

describe('layering', () => {
  it('api.ts uses the exported isBenignFirestoreFailure', () => {
    const mapSrc = readFileSync(join(ROOT, 'src/services/mapApi.ts'), 'utf8');
    const recordSrc = readFileSync(join(ROOT, 'src/services/farmRecordApis.ts'), 'utf8');
    expect(mapSrc).toMatch(/isBenignFirestoreFailure/);
    expect(recordSrc).toMatch(/isBenignFirestoreFailure/);
    expect(mapSrc).toMatch(/from ['"]\.\.\/lib\/firestoreErrors['"]/);
    expect(recordSrc).toMatch(/from ['"]\.\.\/lib\/firestoreErrors['"]/);
    expect(mapSrc).not.toMatch(/function isBenignFirestoreFailure/);
    expect(recordSrc).not.toMatch(/function isBenignFirestoreFailure/);
  });

  it('farmModules does not import cropPacks', () => {
    const src = readFileSync(join(ROOT, 'shared/auth/farmModules.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"][^'"]*cropPacks['"]/);
  });

  it('AuthContext does not import pack hooks', () => {
    const src = readFileSync(join(ROOT, 'src/contexts/AuthContext.tsx'), 'utf8');
    expect(src).not.toMatch(/from ['"].*\/hooks\//);
  });

  it('src/lib does not import src/components', () => {
    const hits: string[] = [];
    for (const abs of walkTs(join(ROOT, 'src/lib'))) {
      for (const spec of importSpecifiers(readFileSync(abs, 'utf8'))) {
        const fromRel = spec.startsWith('.') && /(^|\/)components(\/|$)/.test(spec);
        const fromAlias = spec === 'src/components' || spec.startsWith('src/components/');
        if (fromRel || fromAlias) hits.push(`${abs} → ${spec}`);
      }
    }
    expect(hits).toEqual([]);
    const autoSync = readFileSync(join(ROOT, 'src/lib/autoSync.ts'), 'utf8');
    expect(autoSync).toMatch(/components\/sync\/useAutoSync/);
  });

  it('pages do not import Leaflet, turf, or Firestore', () => {
    const forbidden = /^(?:leaflet(?:[/.].*)?|leaflet[-.].+|react-leaflet(?:\/.*)?|@turf(?:\/.*)?|turf(?:\/.*)?|firebase\/firestore(?:\/.*)?)$/;
    const hits: string[] = [];
    for (const abs of walkTs(join(ROOT, 'src/pages'))) {
      for (const spec of importSpecifiers(readFileSync(abs, 'utf8'))) {
        if (forbidden.test(spec)) hits.push(`${abs} → ${spec}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('empty catalog fallback', () => {
  it('missing or empty enabledModules is the full id list including pack modules', () => {
    const all = allFarmModules();
    expect(resolveFarmEnabledModules(undefined)).toEqual(all);
    expect(resolveFarmEnabledModules([])).toEqual(all);
    expect(all).toContain('drying');
    expect(defaultModulesWithoutCropPacks()).not.toContain('drying');
  });
});

describe('harvest_drying raw migrate (production path)', () => {
  it('resolveFarmCropPacks drops harvest_drying; raw map still splits', () => {
    const raw = {
      harvest_drying: {
        status: 'active',
        installedAt: '2026-08-24T00:00:00.000Z',
        activatedAt: '2026-08-24T00:00:00.000Z',
      },
    };
    expect(resolveFarmCropPacks(raw)).toEqual({});

    // Production lifecycle passes the raw map so migrate can see harvest_drying.
    const fromRaw = migrateLegacyPacks({
      cropPacks: raw,
      modules: defaultModulesWithoutCropPacks(),
      nowIso: '2026-08-26T00:00:00.000Z',
    });
    expect(fromRaw.migrated).toBe(true);
    expect(fromRaw.cropPacks.harvest?.status).toBe('active');
    expect(fromRaw.cropPacks.drying?.status).toBe('active');
    expect('harvest_drying' in fromRaw.cropPacks).toBe(false);

    // Resolved map loses the leftover id; harvest already in modules still
    // installs drying via the core-ops migrate (do not drop that path).
    const resolvedOnly = migrateLegacyPacks({
      cropPacks: resolveFarmCropPacks(raw),
      modules: [...defaultModulesWithoutCropPacks(), 'harvest'],
    });
    expect(resolvedOnly.cropPacks.drying?.status).toBe('active');
  });
});
