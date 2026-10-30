import { AuditLog } from './core/audit.ts';
import { createMockConnectors } from './core/connectors.ts';
import { Engine } from './core/engine.ts';
import { geminiModel, mockModel } from './core/model.ts';

const g = globalThis as unknown as { __engine?: Engine };
export function getEngine(): Engine {
  if (!g.__engine) {
    const key = process.env.GEMINI_API_KEY;
    g.__engine = new Engine({ model: key ? geminiModel(key, process.env.GEMINI_MODEL) : mockModel, connectors: createMockConnectors().connectors,
      audit: new AuditLog(), killSwitch: () => process.env.KILL_SWITCH === 'true' });
  }
  return g.__engine;
}
