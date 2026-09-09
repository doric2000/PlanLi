/** @jest-environment jsdom */
// Exercise actual renderer input handling; only GPU/image loading is stubbed.
jest.mock('three', () => ({
  ...jest.requireActual('three'),
  WebGLRenderer: class {
    capabilities = { getMaxAnisotropy: () => 1 };
    setPixelRatio() {} setSize() {} render() {} dispose() {}
  },
}));
let post;
const selections = () => post.mock.calls.map(([value]) => JSON.parse(value)).filter(({ type }) => type === 'select');
const marker = () => document.querySelector('[data-region="europe"]');
function pointer(target, type, x, y) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId: 1 });
  target.dispatchEvent(event);
}
beforeEach(async () => {
  jest.resetModules();
  document.body.innerHTML = '<main><canvas></canvas></main>';
  global.__ATLAS_ASSETS__ = { font: '', photos: {}, land: { features: [] } };
  window.__ATLAS_CHANNEL__ = 'runtime-test';
  global.FontFace = class { load() { return Promise.resolve(this); } };
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {} } });
  global.Image = class { set src(_value) { Promise.resolve().then(() => this.onload()); } };
  global.ResizeObserver = class { observe() {} disconnect() {} };
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => () => {} }));
  document.querySelector('main').setPointerCapture = () => {};
  jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  post = jest.spyOn(window, 'postMessage').mockImplementation(() => {});
  require('../src/features/region/globe/runtime');
  // Local font, image Promise.all and startup complete before readiness.
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  expect(post.mock.calls.map(([message]) => JSON.parse(message).type)).toContain('ready');
  post.mockClear();
});
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  jest.restoreAllMocks();
});
it('selects from assistive technology click activation', () => {
  marker().click();
  expect(selections()).toEqual([{ channel: 'runtime-test', type: 'select', regionId: 'europe' }]);
});
it('selects only once for a physical tap followed by the browser click', () => {
  const button = marker();
  pointer(button, 'pointerdown', 100, 100); pointer(button, 'pointerup', 100, 100);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(selections()).toHaveLength(1);
});
it('does not select when dragging a photo', () => {
  const button = marker();
  pointer(button, 'pointerdown', 100, 100); pointer(button, 'pointermove', 170, 100); pointer(button, 'pointerup', 170, 100);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(selections()).toHaveLength(0);
});
it.each(['Enter', ' '])('supports keyboard activation using %s', (key) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  marker().dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(selections()).toHaveLength(1);
});
it('ignores activation while the host screen is inactive', () => {
  window.planliAtlas.update({ channel: 'runtime-test', type: 'state', active: false, regionId: null });
  marker().click();
  marker().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(selections()).toHaveLength(0);
});
