import { test, expect } from "bun:test";
import { hash } from "./hash.ts";

test("same string gives same hash", () => {
  expect(hash("hello world")).toBe(hash("hello world"));
});

test("different strings give different hashes", () => {
  expect(hash("abc")).not.toBe(hash("def"));
});

test("empty string works", () => {
  expect(typeof hash("")).toBe("number");
  expect(hash("")).toBe(hash(""));
});
