import React from 'react';
import { Alert, Modal, Platform } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ContentActionMenu from '../src/components/ContentActionMenu';
import { useAuth } from '../src/features/auth/AuthContext';
import { AUTH_STATES, CAPABILITIES } from '../src/constants/authPolicy';
import { submitReport } from '../src/services/SocialService';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/features/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/services/SocialService', () => ({ setBlockedUser: jest.fn(), submitReport: jest.fn() }));

const target = { type: 'recommendation', id: 'rec-1' };
const originalOS = Platform.OS;

describe('ContentActionMenu', () => {
  let ensureCapability;

  beforeEach(() => {
    ensureCapability = jest.fn(async () => true);
    useAuth.mockReturnValue({
      user: { uid: 'viewer' }, status: AUTH_STATES.READY,
      ensureCapability, handleCallableAuthError: jest.fn(() => false),
    });
    submitReport.mockResolvedValue({});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it.each(['ios', 'android', 'web'])('opens reporting from the menu on %s and sends the original target', async (os) => {
    Platform.OS = os;
    const screen = render(<ContentActionMenu target={target} ownerId="owner" />);
    const stopPropagation = jest.fn();
    fireEvent.press(screen.getByTestId('content-action-menu'), { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('עריכה')).toBeNull();
    expect(screen.queryByText('מחיקה')).toBeNull();
    const menuModal = screen.UNSAFE_getAllByType(Modal).find((modal) => modal.props.animationType === 'fade');

    await act(async () => fireEvent.press(screen.getByLabelText('דיווח על ההמלצה')));
    if (os === 'ios') {
      expect(ensureCapability).not.toHaveBeenCalled();
      await act(async () => menuModal.props.onDismiss());
    }
    expect(ensureCapability).toHaveBeenCalledWith(CAPABILITIES.ACTIVE);
    expect(screen.getByText('מה הסיבה המתאימה ביותר? הדיווח פרטי וייבדק על ידי צוות פלאן לי.')).toBeTruthy();
    fireEvent.press(screen.getByText('ספאם, הונאה או פרסום מסחרי'));
    await act(async () => fireEvent.press(screen.getByText('שליחת דיווח')));
    await waitFor(() => expect(submitReport).toHaveBeenCalledWith(target, 'spam_scam_commercial', ''));
  }, 15000);

  it('keeps owner edit/delete actions and hides reporting', () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const screen = render(<ContentActionMenu target={target} ownerId="viewer" onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.press(screen.getByTestId('content-action-menu'));
    expect(screen.queryByLabelText('דיווח על ההמלצה')).toBeNull();
    fireEvent.press(screen.getByText('עריכה'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('content-action-menu'));
    fireEvent.press(screen.getByText('מחיקה'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it.each([AUTH_STATES.GUEST, AUTH_STATES.EMAIL_VERIFICATION_REQUIRED])('does not expose an empty menu to %s', (status) => {
    useAuth.mockReturnValue({ user: null, status, ensureCapability });
    const screen = render(<ContentActionMenu target={target} ownerId="owner" />);
    expect(screen.queryByTestId('content-action-menu')).toBeNull();
  });

  it('preserves the capability gate when opening a report is denied', async () => {
    Platform.OS = 'android';
    ensureCapability.mockResolvedValue(false);
    const screen = render(<ContentActionMenu target={{ type: 'route', id: 'route-1' }} ownerId="owner" subjectLabel="המסלול" />);
    fireEvent.press(screen.getByTestId('content-action-menu'));
    await act(async () => fireEvent.press(screen.getByLabelText('דיווח על המסלול')));
    expect(screen.queryByText('שליחת דיווח')).toBeNull();
    expect(submitReport).not.toHaveBeenCalled();
  });

  it('exposes reporting alongside explicitly supplied management actions for another owner', () => {
    const screen = render(<ContentActionMenu target={target} ownerId="owner" onEdit={jest.fn()} onDelete={jest.fn()} />);
    fireEvent.press(screen.getByTestId('content-action-menu'));
    expect(screen.getByText('עריכה')).toBeTruthy();
    expect(screen.getByText('מחיקה')).toBeTruthy();
    expect(screen.getByLabelText('דיווח על ההמלצה')).toBeTruthy();
  });
});
