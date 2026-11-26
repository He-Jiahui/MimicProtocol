import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestGraphicsDevice } from '../src/render/device.js';

const adapter = { requestDevice: async () => 'device' };
test('trusted origins and an exposed WebGPU API are separate prerequisites', async () => {
  await assert.rejects(requestGraphicsDevice(false, { requestAdapter: assert.fail }), { code: 'insecure' });
  await assert.rejects(requestGraphicsDevice(true, undefined), { code: 'unsupported' });
});

test('first request leaves power and feature selection to the browser', async () => {
  const gpu = { requestAdapter: async (...args) => { assert.deepEqual(args, []); return adapter; } };
  assert.deepEqual(await requestGraphicsDevice(true, gpu), { device: 'device', compatibility: false });
});

test('missing or rejected core adapters can fall back to a compatibility device', async () => {
  for (const miss of [() => null, () => { throw Error('core unavailable'); }]) {
    const gpu = { requestAdapter: async (options) => {
      if (!options) return miss();
      assert.deepEqual(options, { featureLevel: 'compatibility' });
      return adapter;
    } };
    assert.deepEqual(await requestGraphicsDevice(true, gpu), { device: 'device', compatibility: true });
  }
});

test('an unavailable adapter is distinguished from a device creation failure', async () => {
  await assert.rejects(requestGraphicsDevice(true, { requestAdapter: async () => null }), { code: 'adapter' });
  await assert.rejects(requestGraphicsDevice(true, { requestAdapter: async () => ({ requestDevice: async () => { throw Error('driver error'); } }) }), { code: 'device', message: /driver error/ });
});
