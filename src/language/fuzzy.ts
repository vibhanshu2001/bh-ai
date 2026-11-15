import Fuse from 'fuse.js';
import { CatalogEntity, KNOWN_ENTITIES } from './catalog';
import { ClarificationCandidate } from '../shared/contracts/dto';

export interface FuzzyMatchCandidate {
  entity: CatalogEntity;
  score: number;
  matchedAlias: string;
}

export interface ICandidateSearch {
  search(query: string): ClarificationCandidate[];
}

export interface FuzzyRecord {
  id: string;
  name: string;
  kind: 'app' | 'project' | 'service' | 'workflow' | 'folder' | 'action';
  alias: string;
  label: string;
}

export interface ICandidateSearch {
  search(query: string, extractedNumber?: number): ClarificationCandidate[];
}

export class FuzzyCandidateSearch implements ICandidateSearch {
  private fuse: Fuse<FuzzyRecord>;

  public static readonly COMMAND_TEMPLATES: Array<{ id: string; name: string; kind: 'action'; aliases: string[]; label: string }> = [
    {
      id: 'system.memory.inspect',
      name: 'Inspect System Memory',
      kind: 'action',
      label: 'Inspect Memory (bhai memory dekh)',
      aliases: ['bhai memory dekh', 'memory dekh', 'ram dekh', 'memory usage', 'ram usage', 'check memory']
    },
    {
      id: 'system.cpu.inspect',
      name: 'Inspect CPU Activity',
      kind: 'action',
      label: 'Inspect CPU (cpu usage)',
      aliases: ['cpu usage', 'cpu dekh', 'check cpu', 'cpu status']
    },
    {
      id: 'system.disk.inspect',
      name: 'Inspect Disk Space',
      kind: 'action',
      label: 'Inspect Disk (disk space)',
      aliases: ['disk space', 'disk usage', 'storage status', 'check disk']
    },
    {
      id: 'system.battery.inspect',
      name: 'Inspect Battery Status',
      kind: 'action',
      label: 'Inspect Battery (battery status)',
      aliases: ['battery status', 'battery dekh', 'check battery']
    },
    {
      id: 'system.volume.set',
      name: 'Set Audio Volume',
      kind: 'action',
      label: 'Set Volume (volume)',
      aliases: ['volume', 'set volume', 'sound', 'awaz']
    },
    {
      id: 'process.inspect',
      name: 'List Running Processes',
      kind: 'action',
      label: 'Process List (ps aux)',
      aliases: ['process list', 'ps aux', 'top processes', 'list processes']
    }
  ];

  constructor(entities: CatalogEntity[] = KNOWN_ENTITIES) {
    const records: FuzzyRecord[] = [];

    // 1. Index Known Entities (Apps, Projects, Services, Workflows, Folders)
    for (const ent of entities) {
      for (const alias of ent.aliases) {
        records.push({ id: ent.id, name: ent.name, kind: ent.kind, alias: alias.toLowerCase(), label: ent.name });
      }
      records.push({ id: ent.id, name: ent.name, kind: ent.kind, alias: ent.name.toLowerCase(), label: ent.name });
    }

    // 2. Index Action Command Templates for typo matching (e.g. "memry dekh", "ram deko", "volum")
    for (const cmd of FuzzyCandidateSearch.COMMAND_TEMPLATES) {
      for (const alias of cmd.aliases) {
        records.push({ id: cmd.id, name: cmd.name, kind: cmd.kind, alias: alias.toLowerCase(), label: cmd.label });
      }
      records.push({ id: cmd.id, name: cmd.name, kind: cmd.kind, alias: cmd.name.toLowerCase(), label: cmd.label });
    }

    this.fuse = new Fuse(records, {
      keys: ['alias'],
      includeScore: true,
      threshold: 0.45, // strictly bounded threshold
      minMatchCharLength: 3,
      shouldSort: true
    });
  }

  public search(query: string, extractedNumber?: number): ClarificationCandidate[] {
    let clean = query.trim().toLowerCase();
    // Strip leading "bhai" for cleaner search
    clean = clean.replace(/^(?:bhai\b[,\s]*)/i, '').trim();

    // Safety check: Never fuzzy match numbers, paths, or very short queries (<3 chars)
    if (clean.length < 3 || /^\d+$/.test(clean) || clean.startsWith('/')) {
      return [];
    }

    // Also strip numeric parameters from query for template matching (e.g. "volum 50" -> query "volum")
    const withoutNumbers = clean.replace(/\b\d+\b/g, '').trim();
    const queryToSearch = withoutNumbers.length >= 3 ? withoutNumbers : clean;

    let results = this.fuse.search(clean);
    if ((!results || results.length === 0) && queryToSearch !== clean) {
      results = this.fuse.search(queryToSearch);
    }

    if (!results || results.length === 0) {
      // Strip common command action verbs/suffixes to match entity name
      const stripped = clean
        .replace(/\b(?:logs\s+dikha|logs|kholo|khol|open|start|stop|status|dekh|dikha|check|view)\b/g, '')
        .trim();
      if (stripped && stripped.length >= 3 && stripped !== clean) {
        results = this.fuse.search(stripped);
      }
    }

    if (!results || results.length === 0) {
      return [];
    }

    const seenIds = new Set<string>();
    const candidates: ClarificationCandidate[] = [];

    for (const res of results) {
      if (res.score !== undefined && res.score <= 0.45) {
        const item = res.item;
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          const scorePercent = Math.round((1 - (res.score || 0)) * 100);

          let label = item.label;
          if (item.id === 'system.volume.set' && extractedNumber !== undefined) {
            label = `Set Volume to ${extractedNumber}`;
          }

          candidates.push({
            id: item.id,
            label,
            kind: item.kind,
            description: `Similar to "${query}" (${scorePercent}% match)`
          });
          if (candidates.length >= 4) break; // Limit to 4 candidates
        }
      }
    }

    return candidates;
  }
}
