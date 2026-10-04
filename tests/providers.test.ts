import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProvider, draftFrom, positiveInt, type ProviderDraft } from '../panel/providers';

const existing = {
  package: 'aisdk:@ai-sdk/openai-compatible',
  settings: { baseURL: 'https://example.com/v1' },
  models: {
    old: {
      modelID: 'old',
      name: 'Old model',
      variants: [
        { id: 'high', settings: { reasoningEffort: 'high', vendorFlag: true, nested: { keep: 1 } } },
      ],
    },
  },
};

test('editing a model preserves custom variant settings, including after rename', () => {
  const draft = draftFrom('provider', existing);
  draft.models[0]!.id = 'renamed';
  const result = buildProvider(draft, existing);
  const model = (result.models as Record<string, { variants: Array<{ id: string; settings: Record<string, unknown> }> }>).renamed!;
  assert.equal(model.variants[0]!.settings.vendorFlag, true);
  assert.deepEqual(model.variants[0]!.settings.nested, { keep: 1 });
});

test('positiveInt accepts only positive safe whole-number strings', () => {
  assert.equal(positiveInt('128000'), 128000);
  for (const value of ['128000abc', '1.5', '0', '-2', '9007199254740992']) {
    assert.equal(positiveInt(value), undefined, `${value} should be rejected`);
  }
});

const draft: ProviderDraft = {
  providerID: 'provider', name: 'Provider', protocol: 'openai-chat',
  baseURL: 'https://example.com', apiKey: '', models: [],
};
void draft;
