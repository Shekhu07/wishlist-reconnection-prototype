module.exports = function (api) {
  api.cache(true);
  // Path aliases (`@/…`) come from tsconfig.json; Expo's Metro config reads
  // them directly, and Jest maps them via moduleNameMapper in package.json.
  return { presets: ["babel-preset-expo"] };
};
