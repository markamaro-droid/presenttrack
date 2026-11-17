import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/robot-menu.js', import.meta.url), 'utf8');

function setup() {
  const elements = new Map(), observers = new Map();
  const document = { activeElement: null };
  function element(id, parent = null) {
    const attrs = new Map(), events = new Map(), classes = new Set();
    const node = { id, parentElement: parent, hidden: false, inert: false, dataset: {}, innerHTML: '',
      classList: { add: name => classes.add(name), contains: name => classes.has(name), toggle(name, on) { on ? classes.add(name) : classes.delete(name); } },
      setAttribute: (key, value) => attrs.set(key, value), getAttribute: key => attrs.get(key), removeAttribute: key => attrs.delete(key),
      addEventListener(type, fn) { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
      dispatch(type, event = {}) { for (const fn of events.get(type) || []) fn({ preventDefault() {}, stopPropagation() {}, ...event }); },
      click() { this.dispatch('click'); }, focus() { document.activeElement = this; },
      contains(child) { for (; child; child = child.parentElement) if (child === this) return true; return false; }
    };
    elements.set(id, node); return node;
  }
  const bot = element('bot'), bar = element('bar', bot), trigger = element('bc', bot), panel = element('tracy-voice', bot);
  const talk = element('bvoice', bar), tour = element('bguide', bar), mute = element('bmute', bar), mini = element('bmin', bar);
  panel.hidden = true; bot.classList.add('app');
  bot.querySelector = () => bar; bar.querySelector = () => mini;
  document.getElementById = id => elements.get(id);
  const documentEvents = element('document');
  document.addEventListener = documentEvents.addEventListener.bind(documentEvents);
  const notify = node => observers.get(node)?.();
  let voiceCalls = 0;
  const PTVoice = { toggle() { voiceCalls++; panel.hidden = !panel.hidden; if (!panel.hidden) panel.focus(); notify(panel); }, close() { voiceCalls++; panel.hidden = true; notify(panel); } };
  // The conversation controller owns the chat button's existing action.
  talk.addEventListener('click', PTVoice.toggle);
  const podium = { voiceOn: true, setVoice(on) { podium.voiceOn = on; } };
  vm.runInNewContext(source, { document, window: { PTVoice }, podium,
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe(node) { observers.set(node, this.fn); } },
    getComputedStyle: node => ({ display: node.hidden ? 'none' : 'grid' })
  });
  return { bot, bar, trigger, panel, talk, tour, mute, mini, podium, document, documentEvents, notify,
    get voiceCalls() { return voiceCalls; } };
}

test('clicking Tracy toggles only the shortcuts, including accessibility state', () => {
  const app = setup();
  assert.equal(app.trigger.getAttribute('aria-controls'), 'tracy-shortcuts');
  for (const expected of [true, false, true, false]) {
    app.trigger.click();
    assert.equal(app.bot.classList.contains('menu'), expected);
    assert.equal(app.bar.inert, !expected);
    assert.equal(app.trigger.getAttribute('aria-expanded'), String(expected));
    assert.equal(app.panel.hidden, true);
  }
  assert.equal(app.voiceCalls, 0);
});

test('chat opens conversation and keeps panel focus; Tracy still toggles controls independently', () => {
  const app = setup(); app.trigger.click(); app.talk.click();
  assert.equal(app.panel.hidden, false); assert.equal(app.document.activeElement, app.panel);
  app.trigger.click();
  assert.equal(app.bot.classList.contains('menu'), false); assert.equal(app.panel.hidden, false);
  assert.equal(app.voiceCalls, 1);
  app.trigger.click(); app.talk.click();
  assert.equal(app.panel.hidden, true); assert.equal(app.voiceCalls, 2);
  assert.equal(app.document.activeElement, app.talk);
});

test('keyboard activation toggles shortcuts and arrow navigation focuses controls', () => {
  const app = setup();
  app.trigger.dispatch('keydown', { key: 'Enter' }); assert.equal(app.bar.inert, false);
  app.trigger.dispatch('keydown', { key: ' ' }); assert.equal(app.bar.inert, true);
  app.trigger.dispatch('keydown', { key: 'ArrowDown' }); assert.equal(app.document.activeElement, app.talk);
  app.bar.dispatch('keydown', { key: 'ArrowDown' }); assert.equal(app.document.activeElement, app.tour);
  app.bot.dispatch('keydown', { key: 'Escape' });
  assert.equal(app.bar.inert, true); assert.equal(app.document.activeElement, app.trigger);
  assert.equal(app.voiceCalls, 0);
});

test('outside click and shortcut Escape do not dismiss an open conversation', () => {
  const app = setup(); app.trigger.click(); app.talk.click();
  app.documentEvents.dispatch('pointerdown', { target: {} });
  assert.equal(app.bar.inert, true); assert.equal(app.panel.hidden, false);
  app.trigger.click(); app.bot.dispatch('keydown', { key: 'Escape' });
  assert.equal(app.bar.inert, true); assert.equal(app.panel.hidden, false);
  assert.equal(app.voiceCalls, 1);
});

test('hover label copy describes each action and tracks conversation and sound state', () => {
  const app = setup();
  for (const [button, text] of [[app.talk, 'Open conversation'], [app.tour, 'Start guided tour'], [app.mini, 'Minimize Tracy'], [app.mute, 'Mute Tracy']]) {
    assert.equal(button.getAttribute('aria-label'), text);
    assert.ok(button.innerHTML.includes(`<span class="bubble-label" aria-hidden="true">${text}</span>`));
    assert.equal(button.getAttribute('title'), undefined, 'avoid duplicate browser tooltips');
  }
  app.talk.click(); assert.equal(app.talk.getAttribute('aria-label'), 'Close conversation');
  app.podium.setVoice(false); assert.equal(app.mute.getAttribute('aria-label'), 'Unmute Tracy');
});

test('welcome, tour and minimized states cannot leave shortcuts open', () => {
  for (const state of ['welcome', 'tourmode', 'hidden']) {
    const app = setup(); app.trigger.click();
    if (state === 'hidden') app.bot.hidden = true; else app.bot.classList.add(state);
    app.notify(app.bot); app.trigger.click();
    assert.equal(app.bar.inert, true); assert.equal(app.trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(app.voiceCalls, 0);
  }
});
