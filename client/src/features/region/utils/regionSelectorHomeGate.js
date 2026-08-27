export function shouldAutoOpenRegionSelector({
  previewEnabled,
  selectionLoading,
  hasSeenPrompt,
  isFocused,
  personalizationReady,
  dashboardSettled,
  refreshing,
  confirming,
  noyaOpenedThisVisit,
  alreadyOpened,
}) {
  return previewEnabled
    && !selectionLoading
    && !hasSeenPrompt
    && isFocused
    && personalizationReady
    && dashboardSettled
    && !refreshing
    && !confirming
    && !noyaOpenedThisVisit
    && !alreadyOpened;
}
