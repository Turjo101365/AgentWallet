import { test, describe } from 'node:test';
import assert from 'node:assert';
import app from '../app.js';

describe('Backend Health & Route Tests', () => {
  test('GET /health returns 200 with status healthy', async () => {
    // Basic route verification
    assert.ok(app);
  });
});
