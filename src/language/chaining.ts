export interface ClauseSplit {
  isChained: boolean;
  clauses: string[];
  conjunctions: string[];
}

export class ChainingParser {
  private static readonly CONJUNCTIONS = ['aur', 'and', 'then'];
  private static readonly PROTECTED_ENTITIES = [
    'research and development',
    'r & d',
    'search and replace'
  ];

  public static splitClauses(normalized: string): ClauseSplit {
    // If the string contains a protected entity with "and", temporarily mask it
    let masked = normalized;
    const masks: Array<{ placeholder: string; original: string }> = [];

    for (let i = 0; i < ChainingParser.PROTECTED_ENTITIES.length; i++) {
      const pe = ChainingParser.PROTECTED_ENTITIES[i];
      const peRegex = new RegExp(pe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let m: RegExpExecArray | null;
      while ((m = peRegex.exec(masked)) !== null) {
        const placeholder = `__PROTECTED_ENTITY_${i}__`;
        masks.push({ placeholder, original: m[0] });
        masked = masked.substring(0, m.index) + placeholder + masked.substring(m.index + m[0].length);
        break;
      }
    }

    // Split by standalone conjunctions: " aur ", " and ", " then ", and ", aur ", ", and "
    const regex = /(?:,\s*|\s+)(aur|and|then)\s+/gi;
    const clauses: string[] = [];
    const conjunctions: string[] = [];

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(masked)) !== null) {
      const clause = masked.substring(lastIndex, match.index).trim();
      if (clause) {
        clauses.push(clause);
        conjunctions.push(match[1].toLowerCase());
      }
      lastIndex = regex.lastIndex;
    }

    const finalClause = masked.substring(lastIndex).trim();
    if (finalClause) {
      clauses.push(finalClause);
    }

    // Unmask clauses
    const unmaskedClauses = clauses.map((c) => {
      let restored = c;
      for (const m of masks) {
        restored = restored.split(m.placeholder).join(m.original);
      }
      return restored;
    });

    if (unmaskedClauses.length > 1) {
      return {
        isChained: true,
        clauses: unmaskedClauses,
        conjunctions
      };
    }

    return {
      isChained: false,
      clauses: [normalized],
      conjunctions: []
    };
  }
}
