function runtimeEnvironment(env = process.env) {
  const project = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || 'planli-f0b12';
  if (project !== 'planli-f0b12' && !/^planli-staging-[a-z0-9-]+$/.test(project)) {
    if (env.FUNCTIONS_EMULATOR === 'true') return runtimeEnvironment({});
    throw new Error('Unsupported PlanLi Functions project.');
  }
  const expectedBucket = `${project}-media-eu`;
  const bucket = env.MEDIA_STORAGE_BUCKET || expectedBucket;
  if (bucket !== expectedBucket) throw new Error('Media bucket must belong to the Functions environment.');
  return { bucket,
    coreServiceAccount: `planli-core-functions@${project}.iam.gserviceaccount.com`,
    mediaServiceAccount: `planli-media-functions@${project}.iam.gserviceaccount.com` };
}
module.exports = { runtimeEnvironment };
