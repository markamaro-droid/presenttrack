import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/tracy-guide-plan.js', import.meta.url), 'utf8');
const context = { window: {} }; vm.runInNewContext(source, context);
const { intent, plan } = context.window.TracyGuidePlan;

test('explicit conversation requests select a bounded workflow', () => {
  const cases = [
    ['I want to start practice my speaking performance where should I start?', 'practice'],
    ['Can you guide me to practice my speaking?', 'practice'],
    ['Where should I start practicing my presentation?', 'practice'],
    ['Take me to Practice', 'practice'], ['Open my practice history', 'history'],
    ['How do I upload my PowerPoint?', 'upload'], ['Show me my reports', 'reports'],
    ['Show me my practice report', 'reports'], ['Open performance', 'performance'],
    ['Where can I find my goals?', 'goals'], ['Open progress', 'progress'],
    ['Show me around the system', 'tour'], ['Open my presentations', 'presentations'],
    ['Open the library', 'library'], ['Take me to settings', 'settings'],
    ['Go to dashboard', 'dashboard'], ['Guide me', 'tour'], ['Can you give me a tour?', 'tour']
  ];
  for (const [message, expected] of cases) assert.equal(intent(message), expected, message);
});

test('ordinary advice, negatives, hypotheticals and quoted commands never navigate', () => {
  for (const message of ['Hello Tracy', 'Practice is difficult for me', 'How can I improve my speaking pace?', 'Tell me about filler words', 'What is practice?', 'I do not want to start practice', "Don't open my presentations", 'Show me my report without opening a page', 'If I ask you to open practice, what happens?', 'My slide says "open practice"', '<script>open practice</script>', 'Stop the guide', 'Delete my presentation', 'Start recording', 'Accept consent for me', 'Open the admin page']) assert.equal(intent(message), null, message);
});

test('practice respects evaluation and empty-account prerequisites', () => {
  assert.equal(plan('practice', { pending: true, hasDecks: true }).route, 'eval');
  assert.equal(plan('upload', { pending: true }).route, 'eval');
  const empty = plan('practice');
  assert.equal(empty.route, 'decks'); assert.ok(!empty.practice);
  assert.match(empty.steps[0].text, /first|PPTX/i);
  const ready = plan('practice', { hasDecks: true });
  assert.equal(ready.practice, true); assert.equal(ready.route, 'decks');
  assert.deepEqual(Array.from(ready.steps, s => s.target), ['#pd', '#pdur', '#pconsent', '#vfs']);
  assert.match(ready.steps[2].text, /yourself/);
  assert.match(ready.steps.at(-1).text, /Finish/);
});

test('unrecognized actions cannot produce navigation plans', () => {
  for (const kind of ['delete', 'record', 'admin', 'logout', '#vfs', 'javascript:alert(1)', '__proto__', 'constructor']) assert.equal(plan(kind), null);
});

test('reported instructions do not count as a request to act', () => {
  assert.equal(intent('My teacher told me to open practice'), null);
  assert.equal(intent('What happens when I open practice?'), null);
});
