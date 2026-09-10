import { createContext, useContext } from 'react';

export const OperationContext = createContext({ entries: [], active: true, persistenceError: false,
  noticeActive: false, setNoticeActive: () => {} });
export const useOperations = () => useContext(OperationContext);
