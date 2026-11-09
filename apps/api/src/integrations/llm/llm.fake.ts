import type {
  EventClassificationInput, EventClassificationOutput, ExplanationInput, ExplanationOutput, HealthStatus, LlmProvider,
} from '../ports';
import { heuristicEventClassification, templateExplanation } from './templates';

/** Deterministic LLM: same templates as the real adapter's fallback. Counts calls for tests. */
export class FakeLlmProvider implements LlmProvider {
  readonly provider = 'fake';
  readonly model = 'fake';
  explainCalls = 0;
  classifyCalls = 0;

  async explain(input: ExplanationInput): Promise<ExplanationOutput> {
    this.explainCalls++;
    return templateExplanation(input);
  }

  async classifyEvent(input: EventClassificationInput): Promise<EventClassificationOutput> {
    this.classifyCalls++;
    return heuristicEventClassification(input);
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, detail: 'fake' };
  }
}
