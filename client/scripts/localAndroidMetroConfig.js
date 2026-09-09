function withLocalAndroidValidation(config, env = process.env) {
  if (env.PLANLI_LOCAL_E2E !== 'true') return config;
  const previous = config.resolver?.blockList;
  return { ...config, maxWorkers: 1, resolver: { ...config.resolver,
    blockList: [...(Array.isArray(previous) ? previous : previous ? [previous] : []),
      /(?:^|[\\/])\.codex_tmp(?:[\\/]|$)/],
  } };
}
module.exports = { withLocalAndroidValidation };
