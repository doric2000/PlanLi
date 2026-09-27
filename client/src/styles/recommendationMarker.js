export function recommendationMarkerAppearance(visual, selected = false) {
  return {
    width: 44, height: 44, borderRadius: 22, borderWidth: 3,
    borderColor: selected ? '#1E3A5F' : '#FFFFFF',
    backgroundColor: selected ? '#FF9F1C' : visual?.color || '#1E3A5F',
    color: selected ? '#1E3A5F' : '#FFFFFF',
  };
}
