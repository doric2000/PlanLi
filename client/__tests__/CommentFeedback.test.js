import { saveComment, deleteComment } from '../src/services/SocialService';
import { operationStore, setOperationPrincipal } from '../src/features/operations/operationService';

const mockCall = jest.fn();
jest.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => (data) => mockCall(name, data) }));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: {} }));
jest.mock('../src/services/ErrorReporting', () => ({ captureDiagnosticException: jest.fn() }));

test('create, reply, edit and delete bypass the journal on success and failure', async () => {
  setOperationPrincipal('commenter');
  await operationStore.hydrate();
  const target = { type: 'recommendation', id: 'post' };
  const actions = [() => saveComment(target, 'בדיקה'), () => saveComment(target, 'בדיקה', { replyToCommentId: 'root' }),
    () => saveComment(target, 'בדיקה', { commentId: 'own' }), () => deleteComment(target, 'own')];
  for (const action of actions) {
    mockCall.mockResolvedValueOnce({ data: { saved: true } });
    await expect(action()).resolves.toEqual({ saved: true });
    const failure = new Error('failed');
    mockCall.mockRejectedValueOnce(failure);
    await expect(action()).rejects.toBe(failure);
    expect(operationStore.getSnapshot()).toEqual([]);
  }
  expect(mockCall).toHaveBeenCalledTimes(8);
});
