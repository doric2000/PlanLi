import { act, renderHook } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';
import { useContentShare } from '../src/hooks/useContentShare';

const content = { kind: 'recommendation', id: 'rec-1', title: 'המלצה נהדרת', status: 'active' };
beforeEach(() => {
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it.each(['recommendation', 'route'])('shares the title and canonical %s URL', async (kind) => {
  const { result } = renderHook(() => useContentShare({ ...content, kind }));
  await act(() => result.current());
  expect(Share.share).toHaveBeenCalledWith({ title: content.title, message: `${content.title}\nhttps://planli.cc/${kind}/rec-1` });
});

it('blocks repeated taps, accepts cancellation and allows a later share', async () => {
  let finish;
  Share.share.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { result, rerender } = renderHook((props) => useContentShare(props), { initialProps: content });
  let first;
  act(() => { first = result.current(); result.current(); });
  rerender({ ...content, title: 'updated title' });
  await act(() => result.current());
  expect(Share.share).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ action: Share.dismissedAction }); await first; });
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(() => result.current());
  expect(Share.share).toHaveBeenCalledTimes(2);
  expect(Share.share).toHaveBeenLastCalledWith({ title: 'updated title', message: 'updated title\nhttps://planli.cc/recommendation/rec-1' });
});

it.each([
  { status: 'deleted' }, { status: 'held' }, { status: undefined },
  { id: '' }, { id: '../private' }, { kind: 'trip' },
])('does not share unavailable or invalid content: %j', async (change) => {
  const { result } = renderHook(() => useContentShare({ ...content, ...change }));
  await act(() => result.current());
  expect(Share.share).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('השיתוף לא זמין', 'לא הצלחנו לפתוח את אפשרויות השיתוף כרגע.');
});

it('reports native failure once and releases the lock for retry', async () => {
  Share.share.mockRejectedValueOnce(new Error('native failure'));
  const { result } = renderHook(() => useContentShare(content));
  await act(() => result.current());
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  await act(() => result.current());
  expect(Share.share).toHaveBeenCalledTimes(2);
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});
