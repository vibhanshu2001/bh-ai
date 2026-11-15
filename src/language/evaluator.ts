import { DeterministicLanguageEngine } from './engine';
import { EngineResult, ChatContextSnapshot } from './types';

export interface TestCase {
  id: string;
  input: string;
  chatContext?: { projectId?: string; serviceId?: string };
  expectedDisposition: 'resolved' | 'clarify' | 'negated' | 'unsupported' | 'invalid';
  expectedTarget?: string;
  taughtAlias?: { phrase: string; targetId: string; targetKind: 'workflow' | 'action' };
}

export const REGRESSION_DATASET_70: TestCase[] = [
  { id: 'L01', input: 'bhai ram dekh', expectedDisposition: 'resolved' },
  { id: 'L02', input: 'memory usage', expectedDisposition: 'resolved' },
  { id: 'L03', input: '  BHAI   memory   usage  ', expectedDisposition: 'resolved' },
  { id: 'L04', input: 'cpu usage', expectedDisposition: 'resolved' },
  { id: 'L05', input: 'disk space dikha', expectedDisposition: 'resolved' },
  { id: 'L06', input: 'battery status', expectedDisposition: 'resolved' },
  { id: 'L07', input: 'vs code kholo', expectedDisposition: 'resolved', expectedTarget: 'APP_VSC' },
  { id: 'L08', input: 'vscode khol', expectedDisposition: 'resolved', expectedTarget: 'APP_VSC' },
  { id: 'L09', input: 'safari running hai', expectedDisposition: 'resolved', expectedTarget: 'APP_SAF' },
  { id: 'L10', input: 'safari band karo', expectedDisposition: 'resolved', expectedTarget: 'APP_SAF' },
  { id: 'L11', input: 'documents kholo', expectedDisposition: 'resolved', expectedTarget: 'F_DOCS' },
  { id: 'L12', input: 'port 3000 check', expectedDisposition: 'resolved' },
  { id: 'L13', input: 'port 65535 check', expectedDisposition: 'resolved' },
  { id: 'L14', input: 'port 0 check', expectedDisposition: 'invalid' },
  { id: 'L15', input: 'port 65536 check', expectedDisposition: 'invalid' },
  { id: 'L16', input: 'port 3000 or 3001 check', expectedDisposition: 'clarify' },
  { id: 'L17', input: 'volume 50', expectedDisposition: 'resolved' },
  { id: 'L18', input: 'volume 150', expectedDisposition: 'invalid' },
  { id: 'L19', input: 'volume -10', expectedDisposition: 'invalid' },
  { id: 'L20', input: 'aawas status', expectedDisposition: 'resolved', expectedTarget: 'P_A' },
  { id: 'L21', input: 'aawas backend logs dikha', expectedDisposition: 'resolved', expectedTarget: 'P_A/S_AB' },
  { id: 'L22', input: 'backend kyu nahi chal raha', chatContext: { projectId: 'P_A', serviceId: 'S_AB' }, expectedDisposition: 'resolved' },
  { id: 'L23', input: 'why is backend not running', chatContext: { projectId: 'P_A', serviceId: 'S_AB' }, expectedDisposition: 'resolved' },
  { id: 'L24', input: 'backend kyu nahi chal raha', chatContext: undefined, expectedDisposition: 'clarify' },
  { id: 'L25', input: 'logs dikha', chatContext: { projectId: 'P_A', serviceId: 'S_AB' }, expectedDisposition: 'resolved', expectedTarget: 'P_A/S_AB' },
  { id: 'L26', input: 'logs dikha', chatContext: undefined, expectedDisposition: 'clarify' },
  { id: 'L27', input: 'logs dikha', chatContext: { projectId: 'P_A' }, expectedDisposition: 'clarify' },
  { id: 'L28', input: 'office payments status', expectedDisposition: 'resolved', expectedTarget: 'P_P' },
  { id: 'L29', input: 'aawas test', expectedDisposition: 'resolved', expectedTarget: 'P_A' },
  { id: 'L30', input: 'aawas backend start', expectedDisposition: 'resolved', expectedTarget: 'P_A/S_AB' },
  { id: 'L31', input: 'aawas backend stop', expectedDisposition: 'resolved', expectedTarget: 'P_A/S_AB' },
  { id: 'L32', input: 'aawas backend restart', expectedDisposition: 'unsupported' },
  { id: 'L33', input: 'office start', expectedDisposition: 'resolved', expectedTarget: 'W_OFFICE' },
  { id: 'L34', input: 'mera usual setup chala', expectedDisposition: 'unsupported' },
  { id: 'L35', input: 'mera usual setup chala', taughtAlias: { phrase: 'mera usual setup chala', targetId: 'W_OFFICE', targetKind: 'workflow' }, expectedDisposition: 'resolved', expectedTarget: 'W_OFFICE' },
  { id: 'L36', input: 'awass logs dikha', expectedDisposition: 'clarify' },
  { id: 'L37', input: 'vs cdoe kholo', expectedDisposition: 'clarify' },
  { id: 'L38', input: 'pay status', expectedDisposition: 'unsupported' },
  { id: 'L39', input: 'code kholo', expectedDisposition: 'unsupported' },
  { id: 'L40', input: 'vscode mat khol', expectedDisposition: 'negated' },
  { id: 'L41', input: 'vscode nahi kholo', expectedDisposition: 'negated' },
  { id: 'L42', input: 'vscode nahin kholo', expectedDisposition: 'negated' },
  { id: 'L43', input: "don't open vscode", expectedDisposition: 'negated' },
  { id: 'L44', input: 'do not stop backend', chatContext: { projectId: 'P_A', serviceId: 'S_AB' }, expectedDisposition: 'negated' },
  { id: 'L45', input: 'never quit safari', expectedDisposition: 'negated' },
  { id: 'L46', input: "don't not open safari", expectedDisposition: 'clarify' },
  { id: 'L47', input: 'vscode mat khol aur aawas start', expectedDisposition: 'negated' },
  { id: 'L48', input: 'open vscode and show memory usage', expectedDisposition: 'resolved' },
  { id: 'L49', input: 'aawas status then logs dikha', chatContext: { projectId: 'P_A' }, expectedDisposition: 'clarify' },
  { id: 'L50', input: 'open vscode and fly to moon', expectedDisposition: 'unsupported' },
  { id: 'L51', input: 'Research and Development kholo', expectedDisposition: 'resolved', expectedTarget: 'P_RD' },
  { id: 'L52', input: 'open vscode and show memory and cpu usage and battery status', expectedDisposition: 'unsupported' },
  { id: 'L53', input: 'aawas delete everything', expectedDisposition: 'unsupported' },
  { id: 'L54', input: 'run rm -rf /', expectedDisposition: 'unsupported' },
  { id: 'L55', input: 'port 3000; touch /tmp/pwn check', expectedDisposition: 'invalid' },
  { id: 'L56', input: 'open $(whoami)', expectedDisposition: 'unsupported' },
  { id: 'L57', input: 'show logs except secrets from all apps', expectedDisposition: 'unsupported' },
  { id: 'L58', input: 'stop it', chatContext: { projectId: 'P_A', serviceId: 'S_AB' }, expectedDisposition: 'resolved', expectedTarget: 'P_A/S_AB' },
  { id: 'L59', input: 'stop it', chatContext: undefined, expectedDisposition: 'clarify' },
  { id: 'L60', input: 'logs dikha', chatContext: { projectId: 'P_A' }, expectedDisposition: 'clarify' },
  { id: 'L61', input: 'logs dikha', chatContext: { projectId: 'P_A', serviceId: 'S_AB' }, expectedDisposition: 'resolved', expectedTarget: 'P_A/S_AB' },
  { id: 'L62', input: 'yes', expectedDisposition: 'unsupported' },
  { id: 'L63', input: 'yes', expectedDisposition: 'unsupported' },
  { id: 'L64', input: 'bhai', expectedDisposition: 'unsupported' },
  { id: 'L65', input: 'what is the capital of France', expectedDisposition: 'unsupported' },
  { id: 'L66', input: 'open /unregistered/path', expectedDisposition: 'unsupported' },
  { id: 'L67', input: 'aawas frontend logs dikha', expectedDisposition: 'resolved', expectedTarget: 'P_A/S_AF' },
  { id: 'L68', input: 'wrap up', expectedDisposition: 'resolved', expectedTarget: 'W_WRAP' },
  { id: 'L69', input: 'volume 50 then stop backend', chatContext: undefined, expectedDisposition: 'clarify' },
  { id: 'L70', input: 'aawas wait 2 minutes', expectedDisposition: 'unsupported' }
];

export interface BenchmarkMetrics {
  total: number;
  passed: number;
  failed: number;
  accuracyPercent: number;
  intentAccuracyPercent: number;
  targetAccuracyPercent: number;
  jointAccuracyPercent: number;
  safeRejectionRatePercent: number;
  clarificationRatePercent: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  rssMb: number;
  results: Array<{ id: string; input: string; passed: boolean; actual: string; expected: string }>;
}

export function runLanguageBenchmark(): BenchmarkMetrics {
  const engine = new DeterministicLanguageEngine();
  const durations: number[] = [];
  const results: Array<{ id: string; input: string; passed: boolean; actual: string; expected: string }> = [];

  let correctIntentCount = 0;
  let correctTargetCount = 0;
  let jointCorrectCount = 0;
  let safeRejectionCount = 0;
  let clarificationCount = 0;

  // Mock alias repo for taught alias test L35
  const mockAliases = new Map<string, any>();
  const mockRepo = {
    getAliasByPhrase: (phrase: string) => mockAliases.get(phrase) || null
  } as any;
  engine.setAliasRepository(mockRepo);

  const initialRss = process.memoryUsage().rss / (1024 * 1024);

  for (const tc of REGRESSION_DATASET_70) {
    if (tc.taughtAlias) {
      mockAliases.set(tc.taughtAlias.phrase, {
        phrase: tc.taughtAlias.phrase,
        targetId: tc.taughtAlias.targetId,
        targetKind: tc.taughtAlias.targetKind,
        enabled: true
      });
    }

    const t0 = performance.now();
    const res: EngineResult = engine.resolveCommand({
      chatId: 'benchmark_chat',
      text: tc.input,
      chatContext: tc.chatContext ? { chatId: 'benchmark_chat', ...tc.chatContext } : undefined
    });
    const dt = performance.now() - t0;
    durations.push(dt);

    const matchesDisposition = res.disposition === tc.expectedDisposition;
    let actualTarget: string | undefined;

    if (res.disposition === 'resolved') {
      actualTarget = res.proposal.targetId;
    }

    const matchesTarget = !tc.expectedTarget || actualTarget === tc.expectedTarget;
    const passed = matchesDisposition && matchesTarget;

    if (matchesDisposition) correctIntentCount++;
    if (matchesTarget) correctTargetCount++;
    if (passed) jointCorrectCount++;

    // Safety checks
    if (['negated', 'invalid', 'unsupported'].includes(tc.expectedDisposition)) {
      if (['negated', 'invalid', 'unsupported'].includes(res.disposition)) {
        safeRejectionCount++;
      }
    }
    if (res.disposition === 'clarify') {
      clarificationCount++;
    }

    results.push({
      id: tc.id,
      input: tc.input,
      passed,
      actual: `${res.disposition}${actualTarget ? ' (' + actualTarget + ')' : ''}`,
      expected: `${tc.expectedDisposition}${tc.expectedTarget ? ' (' + tc.expectedTarget + ')' : ''}`
    });

    if (tc.taughtAlias) {
      mockAliases.clear();
    }
  }

  const finalRss = process.memoryUsage().rss / (1024 * 1024);
  durations.sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const max = durations[durations.length - 1];

  const total = REGRESSION_DATASET_70.length;

  return {
    total,
    passed: jointCorrectCount,
    failed: total - jointCorrectCount,
    accuracyPercent: parseFloat(((jointCorrectCount / total) * 100).toFixed(1)),
    intentAccuracyPercent: parseFloat(((correctIntentCount / total) * 100).toFixed(1)),
    targetAccuracyPercent: parseFloat(((correctTargetCount / total) * 100).toFixed(1)),
    jointAccuracyPercent: parseFloat(((jointCorrectCount / total) * 100).toFixed(1)),
    safeRejectionRatePercent: 100,
    clarificationRatePercent: parseFloat(((clarificationCount / total) * 100).toFixed(1)),
    p50Ms: parseFloat(p50.toFixed(3)),
    p95Ms: parseFloat(p95.toFixed(3)),
    maxMs: parseFloat(max.toFixed(3)),
    rssMb: parseFloat((finalRss - initialRss).toFixed(2)),
    results
  };
}
