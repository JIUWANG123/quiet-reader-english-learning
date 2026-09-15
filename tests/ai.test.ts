import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAICompatibleProvider, assistancePrompt, resultFields } from '../src/services/ai/provider';

test('sentence responses exclude word definitions, while word and inline-meaning modes retain them',()=>{
  assert.deepEqual(resultFields('translate'),['translation','briefExplanation']);
  assert.ok(!resultFields('translate').includes('shortMeaning'));
  assert.ok(assistancePrompt('translate').includes('Never append word definitions'));
  assert.ok(resultFields('word').includes('shortMeaning'));
  assert.deepEqual(resultFields('mark_meaning'),['shortMeaning']);
});

test('AI sends explicit target and surrounding context and tolerates non-JSON output', async () => {
  const original = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({choices: [{message: {content: '这里表示不情愿。'}}]}));
  };
  try {
    const provider = new OpenAICompatibleProvider('test-key', {baseUrl: 'https://example.test', model: 'test', temperature: .2});
    const request = {mode: 'word' as const, previousContext: 'She found herself strangely ', targetText: 'reluctant', followingContext: ' to leave.'};
    const result = await provider.assist(request);
    assert.equal(result.briefExplanation, '这里表示不情愿。');
    const messages = calls[0].messages as {content: string}[];
    const sent = JSON.parse(messages[1].content);
    assert.equal(sent.targetText, 'reluctant');
    assert.equal(sent.previousContext, request.previousContext);
    assert.equal(sent.followingContext, request.followingContext);
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = original; }
});
