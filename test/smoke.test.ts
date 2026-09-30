import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { buildApp } from '../src/app.js';

const app = buildApp({ logger: false });

describe('smoke: застосунок піднімається і відповідає', () => {
  before(async () => {
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('GET /health → 200 зі status=ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json<{ status: string; uptime: number }>();

    assert.equal(response.statusCode, 200);
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.uptime, 'number');
  });
});
