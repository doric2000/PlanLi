export function calculateCredibilityScore({ recommendationsCount, likesReceived }) {
  const rec = Number(recommendationsCount || 0);
  const likes = Number(likesReceived || 0);
  return rec * 10 + likes * 2;
}

export function getCredibilityLevelLabel(score) {
  const s = Number(score || 0);
  const level = Math.max(1, Math.floor(s / 50) + 1);
  return `Level ${level} Traveler`;
}
