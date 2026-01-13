export const isPasswordProviderUser = (user) => {
  return !!user?.providerData?.some((p) => p?.providerId === 'password');
};

export const getUserTier = (user) => {
  if (!user) return 'guest';
  if (isPasswordProviderUser(user) && !user.emailVerified) return 'unverified';
  return 'verified';
};

export const isVerifiedUser = (user) => getUserTier(user) === 'verified';
