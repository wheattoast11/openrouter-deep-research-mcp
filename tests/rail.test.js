/**
 * Rail Protocol Tests
 */
const { Rail, Token, Switch, Ok, Err, tokenFromSignal, signalFromToken } = require('../src/core/rail');
const { Signal } = require('../src/core/signal');

describe('Rail Protocol', () => {
  describe('Token', () => {
    test('creates token with id, origin, and trace', () => {
      const token = Token.from('hello', 'test-agent');
      expect(token.id).toBeDefined();
      expect(token.origin).toBe('test-agent');
      expect(token.trace).toEqual(['test-agent']);
      expect(token.value).toBe('hello');
    });

    test('derive preserves lineage', () => {
      const original = Token.from('hello', 'agent-a');
      const derived = original.derive('HELLO', 'transform');

      expect(derived.origin).toBe('agent-a');
      expect(derived.trace).toEqual(['agent-a', 'transform']);
      expect(derived.value).toBe('HELLO');
    });

    test('serializes to JSON and back', () => {
      const token = Token.from({ key: 'value' }, 'test');
      const json = token.toJSON();
      const restored = Token.fromJSON(json);

      expect(restored.id).toBe(token.id);
      expect(restored.value).toEqual({ key: 'value' });
    });
  });

  describe('Rail', () => {
    test('sends and receives tokens', async () => {
      const rail = Rail.create();
      const token = Token.from('test', 'sender');

      const result = rail.send(token);
      expect(result.ok).toBe(true);

      const iter = rail.receive();
      const received = await iter.next();

      expect(received.done).toBe(false);
      expect(received.value.value).toBe('test');
    });

    test('pair creates connected rails', async () => {
      const [a, b] = Rail.pair();

      a.send(Token.from('a→b', 'a'));
      const received = await b.receive().next();

      expect(received.value.value).toBe('a→b');
    });

    test('map transforms tokens', async () => {
      const rail = Rail.create();
      const mapped = rail.map(v => v.toUpperCase());

      rail.send(Token.from('hello', 'test'));
      const result = await mapped.receive().next();

      expect(result.value.value).toBe('HELLO');
    });

    test('filter removes non-matching tokens', async () => {
      const rail = Rail.create();
      const filtered = rail.filter(v => v > 5);

      rail.send(Token.from(3, 'test'));
      rail.send(Token.from(7, 'test'));
      rail.send(Token.from(2, 'test'));

      const result = await filtered.receive().next();
      expect(result.value.value).toBe(7);
    });

    test('tracks backpressure', () => {
      const rail = Rail.create({ maxBuffer: 10 });

      for (let i = 0; i < 5; i++) {
        rail.send(Token.from(i, 'test'));
      }

      expect(rail.pressure).toBe(0.5);
    });
  });

  describe('Switch', () => {
    test('routes by predicate', () => {
      const sw = new Switch();
      const highPriority = Rail.create();
      const lowPriority = Rail.create();

      sw.addRoute((t) => t.value.priority === 'high', highPriority);
      sw.setDefault(lowPriority);

      const token = Token.from({ priority: 'high' }, 'test');
      const route = sw.route(token);

      expect(route).toBe(highPriority);
    });

    test('falls back to default', () => {
      const sw = new Switch();
      const defaultRail = Rail.create();
      sw.setDefault(defaultRail);

      const token = Token.from('anything', 'test');
      expect(sw.route(token)).toBe(defaultRail);
    });
  });

  describe('Result Types', () => {
    test('Ok wraps success value', () => {
      const result = Ok('success');
      expect(result.ok).toBe(true);
      expect(result.value).toBe('success');
    });

    test('Err wraps error', () => {
      const result = Err(new Error('failed'));
      expect(result.ok).toBe(false);
      expect(result.error.message).toBe('failed');
    });
  });

  describe('Signal Integration', () => {
    test('tokenFromSignal wraps Signal in Token', () => {
      const signal = Signal.query('test query', 'claude');
      const token = tokenFromSignal(signal);

      expect(token.origin).toBe('claude');
      expect(token.value.type).toBe('query');
    });

    test('signalFromToken extracts Signal', () => {
      const signal = Signal.response('answer', 'gpt-4', 0.9);
      const token = tokenFromSignal(signal);

      const extracted = signalFromToken(token);
      expect(extracted.type).toBe('response');
      expect(extracted.confidence).toBe(0.9);
    });
  });
});
