export const MAIN_TAB_TRANSITION_OPTIONS = Object.freeze({
  // Animated bottom-tab scenes can be interrupted during rapid navigation and
  // leave the focused route rendered with the inactive scene opacity. Keep tab
  // changes discrete so the active route never depends on animated visibility.
  animation: 'none',
});
