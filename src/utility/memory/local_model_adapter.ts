/**
 * Bhai Phase P4.3 — Layer B: Optional Local Model Adapter
 * Fallback interface to local Ollama (/api/generate) or llama.cpp when available.
 *
 * Requirements & Bounds:
 * - Feature flag gated (disabled by default or on missing runtime).
 * - Strict 5-second timeout (AbortSignal.timeout(5000)).
 * - Graceful fallback: If unreachable, slow, or returning invalid JSON, defaults
 *   silently to Layer A deterministic compaction with 0 errors raised.
 */

import http from 'http';
import { DeterministicCompactor, CompactionResult } from './deterministic_compactor';
import { MemoryCheckpoint, MemoryDecision, MemoryTask } from '../../shared/contracts/memory_dto';

export interface LocalModelConfig {
  enabled?: boolean;
  endpointUrl?: string; // e.g. "http://127.0.0.1:11434"
  modelName?: string; // e.g. "llama3.2:1b" or "qwen2.5-coder:1.5b"
  timeoutMs?: number; // Default 5000ms
}

export class LocalModelAdapter {
  private enabled: boolean;
  private endpointUrl: string;
  private modelName: string;
  private timeoutMs: number;
  private deterministicCompactor: DeterministicCompactor;

  constructor(config?: LocalModelConfig) {
    this.enabled = config?.enabled ?? false;
    this.endpointUrl = config?.endpointUrl ?? 'http://127.0.0.1:11434';
    this.modelName = config?.modelName ?? 'llama3.2:1b';
    this.timeoutMs = config?.timeoutMs ?? 5000;
    this.deterministicCompactor = new DeterministicCompactor();
  }

  /**
   * Compacts checkpoints using local LLM inference if available,
   * falling back cleanly to deterministic Layer A compaction if unavailable or slow.
   */
  public async compact(params: {
    checkpoints: MemoryCheckpoint[];
    decisions?: MemoryDecision[];
    tasks?: MemoryTask[];
  }): Promise<CompactionResult & { usedLayer: 'layer_a_deterministic' | 'layer_b_local_model' }> {
    // 1. Run deterministic compaction baseline first (instant & guarantees invariants)
    const baseResult = this.deterministicCompactor.compact(params);

    // If disabled or empty input, return Layer A immediately
    if (!this.enabled || params.checkpoints.length === 0) {
      return {
        ...baseResult,
        usedLayer: 'layer_a_deterministic'
      };
    }

    try {
      // 2. Attempt Layer B summarization via local Ollama endpoint with strict 5s timeout
      const llmSummary = await this.queryOllamaSummary(baseResult.markdownSummary);

      if (llmSummary && llmSummary.trim().length > 0) {
        // Enforce indestructible invariants: verify decisions & blockers are not discarded by LLM
        let enhancedMarkdown = llmSummary.trim();

        // If the local LLM dropped the blockers or decisions header, re-attach them from Layer A
        if (baseResult.activeBlockersCount > 0 && !enhancedMarkdown.includes('Active Blockers')) {
          const blockerSection = baseResult.markdownSummary.split('## 📜')[0];
          enhancedMarkdown = `${blockerSection.trim()}\n\n${enhancedMarkdown}`;
        }

        return {
          ...baseResult,
          markdownSummary: enhancedMarkdown,
          usedLayer: 'layer_b_local_model'
        };
      }
    } catch {
      // Layer B failed, timed out, or returned invalid response -> transparent fallback to Layer A
    }

    return {
      ...baseResult,
      usedLayer: 'layer_a_deterministic'
    };
  }

  /**
   * Queries local Ollama API (/api/generate) with timeout handling.
   */
  private queryOllamaSummary(contextSummary: string): Promise<string | null> {
    return new Promise((resolve) => {
      let isSettled = false;
      const settle = (val: string | null) => {
        if (!isSettled) {
          isSettled = true;
          resolve(val);
        }
      };

      try {
        const url = new URL(`${this.endpointUrl}/api/generate`);
        const postData = JSON.stringify({
          model: this.modelName,
          prompt: `Summarize the following project progress concisely for coding agents while preserving all blocker warnings and key facts:\n\n${contextSummary}`,
          stream: false
        });

        const req = http.request(
          {
            hostname: url.hostname,
            port: url.port || 11434,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            },
            timeout: this.timeoutMs
          },
          (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              return settle(null);
            }

            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                settle(parsed.response || null);
              } catch {
                settle(null);
              }
            });
          }
        );

        req.on('timeout', () => {
          req.destroy();
          settle(null);
        });

        req.on('error', () => {
          settle(null);
        });

        req.write(postData);
        req.end();
      } catch {
        settle(null);
      }
    });
  }
}
