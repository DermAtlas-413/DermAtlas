module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { "react-compiler": false }]],
    plugins: [
      // Zustand v5 references import.meta.env.MODE which isn't valid in
      // non-module scripts. Replace it with process.env.NODE_ENV which
      // Metro already injects.
      function importMetaToProcessEnv() {
        return {
          visitor: {
            MetaProperty(path) {
              // import.meta.env.MODE → process.env.NODE_ENV
              const { parent } = path;
              if (
                parent.type === "MemberExpression" &&
                parent.property.name === "env"
              ) {
                path.parentPath.replaceWithSourceString("process.env");
              }
            },
          },
        };
      },
    ],
  };
};
