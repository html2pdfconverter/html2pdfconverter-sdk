const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json", "node"],
  extensionsToTreatAsEsm: [".ts"],
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  transform: {
    "^.+\.ts$": "ts-jest",
  },
  transformIgnorePatterns: [
    "<rootDir>/node_modules/(?!axios|form-data)"
  ],
  maxWorkers: 1,
};