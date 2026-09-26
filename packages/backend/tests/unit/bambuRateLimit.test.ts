import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createBambuRateLimiter } from "../../src/middleware/rateLimit.js";

describe("Begrenzung der Bambu-Anmeldeversuche", () => {
  it("lehnt Anfragen ueber dem Limit mit 429 ab", async () => {
    const app = express();
    app.post("/login", createBambuRateLimiter(2), (_req, res) => {
      res.json({ ok: true });
    });
    assert.equal((await request(app).post("/login")).status, 200);
    assert.equal((await request(app).post("/login")).status, 200);
    assert.equal((await request(app).post("/login")).status, 429);
  });
});
