import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL = "http://localhost:3000";

async function fetchJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

test("Bybit status route returns transfer availability data", async () => {
  const { response, body } = await fetchJson("/api/bybit/status");

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(typeof body.fetchedAt, "number");
  assert.equal(typeof body.count, "number");
  assert.ok(body.data && typeof body.data === "object");

  const usdt = body.data.USDT;
  assert.ok(usdt, "expected USDT transfer status");
  assert.ok(usdt.depositEnabled === null || typeof usdt.depositEnabled === "boolean");
  assert.ok(usdt.withdrawEnabled === null || typeof usdt.withdrawEnabled === "boolean");
  assert.ok(Array.isArray(usdt.networks));
  assert.match(body.note, /not exposed through the public endpoint/i);
});

test("Gate.io status route returns transfer availability data", async () => {
  const { response, body } = await fetchJson("/api/gateio/status");

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(typeof body.fetchedAt, "number");
  assert.equal(typeof body.count, "number");
  assert.ok(body.data && typeof body.data === "object");

  const usdt = body.data.USDT;
  assert.ok(usdt, "expected USDT transfer status");
  assert.equal(typeof usdt.depositEnabled, "boolean");
  assert.equal(typeof usdt.withdrawEnabled, "boolean");
  assert.ok(Array.isArray(usdt.networks));
});
