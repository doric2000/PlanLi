import { StyleSheet } from 'react-native';

export const regionSelectorStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#081E39',
  },
  outerGradient: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  canvas: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#08213E',
  },
  referenceImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  regionButton: {
    position: 'absolute',
    overflow: 'visible',
  },
  regionButtonActive: {
    zIndex: 20,
  },
  regionPressedVisual: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  regionPressedImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cancelButton: {
    position: 'absolute',
    left: '3.5%',
    top: '2.4%',
    minWidth: 68,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cancelButtonPressed: {
    opacity: 0.68,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  cancelButtonUnderline: {
    width: 56,
    height: 2,
    marginTop: 6,
    backgroundColor: '#F17A00',
    borderRadius: 1,
  },
  previewChipWrap: {
    marginTop: 20,
    marginHorizontal: 20,
  },
  previewChip: {
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(30,58,95,0.12)',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#10243E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  previewChipCopy: {
    alignItems: 'flex-end',
  },
  previewChipEyebrow: {
    color: '#66768A',
    fontSize: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  previewChipLabel: {
    marginTop: 1,
    color: '#1E3A5F',
    fontSize: 17,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  previewChipAction: {
    minHeight: 44,
    minWidth: 68,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: '#FFF1DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewChipActionText: {
    color: '#E87800',
    fontSize: 14,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  headerRegionAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRegionActionPressed: {
    opacity: 0.72,
  },
  headerRegionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
