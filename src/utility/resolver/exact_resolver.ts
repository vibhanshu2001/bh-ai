export interface CommandResolution {
  raw: string;
  disposition: 'resolved' | 'unsupported';
  actionId?: string;
  intent?: string;
  supportedExamples?: string[];
}

export class ExactCommandResolver {
  private static readonly SUPPORTED_MEMORY_ALIASES = [
    'bhai memory dekh',
    'memory usage',
    'bhai ram dekh',
    'ram dekh',
    'memory'
  ];

  public resolve(input: string): CommandResolution {
    const trimmed = input.trim();
    if (!trimmed) {
      return {
        raw: input,
        disposition: 'unsupported',
        supportedExamples: ['bhai memory dekh', 'memory usage', 'bhai ram dekh']
      };
    }

    const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');

    for (const alias of ExactCommandResolver.SUPPORTED_MEMORY_ALIASES) {
      if (normalized === alias) {
        return {
          raw: input,
          disposition: 'resolved',
          actionId: 'system.memory.inspect',
          intent: 'system.memory_snapshot'
        };
      }
    }

    return {
      raw: input,
      disposition: 'unsupported',
      supportedExamples: ['bhai memory dekh', 'memory usage', 'bhai ram dekh']
    };
  }
}
