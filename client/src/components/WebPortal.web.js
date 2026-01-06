import React from 'react';
import { createPortal } from 'react-dom';

export default function WebPortal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
