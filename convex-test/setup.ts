/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "../convex/schema";

const testModules = import.meta.glob("../convex/**/*.ts");

export function setupTest() {
  return convexTest(schema, testModules);
}

export const aliceIdentity = {
  tokenIdentifier: "alice-token",
  subject: "alice-subject",
  name: "Alice",
  email: "alice@example.com",
  pictureUrl: "https://example.com/a.png",
  issuer: "https://tabulation.example.com",
} as const;

export const bobIdentity = {
  tokenIdentifier: "bob-token",
  subject: "bob-subject",
  name: "Bob",
  email: "bob@example.com",
  pictureUrl: "https://example.com/b.png",
  issuer: "https://tabulation.example.com",
} as const;
