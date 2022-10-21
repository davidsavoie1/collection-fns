Package.describe({
  name: "davidsavoie1:collection-fns",
  version: "0.2.0",
  summary:
    "Functions used on Meteor collections to provide extra functionnality like hooks and joins.",
  git: "https://github.com/davidsavoie1/collection-fns",
  documentation: "README.md",
});

Package.onUse(function (api) {
  api.versionsFrom("2.0");

  api.use("ecmascript");
  api.use("ejson");
  api.use("minimongo");

  api.mainModule("main.js");
});

Npm.depends({
  deepmerge: "4.2.2",
  "deep-object-diff": "1.1.7",
});
