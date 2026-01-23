/**
 * Rail Protocol MCP Integration Tests
 *
 * Tests for:
 * - Discovery tools (list_rails, explain_rail, list_routes, list_tunnels, list_consensus)
 * - Rail handlers integration
 * - Rail notifier functionality
 */

const handlers = require('../src/server/handlers');
const { RailNotifier, NoOpRailNotifier, createRailNotifier } = require('../src/server/railNotifier');

describe('Rail Protocol MCP Integration', () => {
  describe('Rail Handlers', () => {
    test('isRailTool correctly identifies rail tools', () => {
      expect(handlers.isRailTool('list_rails')).toBe(true);
      expect(handlers.isRailTool('explain_rail')).toBe(true);
      expect(handlers.isRailTool('list_routes')).toBe(true);
      expect(handlers.isRailTool('list_tunnels')).toBe(true);
      expect(handlers.isRailTool('list_consensus')).toBe(true);
      expect(handlers.isRailTool('search')).toBe(false);
      expect(handlers.isRailTool('research')).toBe(false);
    });

    test('getRailOp maps tool names to operations', () => {
      expect(handlers.getRailOp('list_rails')).toBe('list');
      expect(handlers.getRailOp('explain_rail')).toBe('explain');
      expect(handlers.getRailOp('list_routes')).toBe('routes');
      expect(handlers.getRailOp('list_tunnels')).toBe('tunnels');
      expect(handlers.getRailOp('list_consensus')).toBe('consensus');
      expect(handlers.getRailOp('unknown_tool')).toBeNull();
    });

    test('listRails returns expected structure', async () => {
      const result = await handlers.listRails({});
      expect(result).toHaveProperty('tunnels');
      expect(result).toHaveProperty('routes');
      expect(result).toHaveProperty('consensus');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.tunnels)).toBe(true);
      expect(Array.isArray(result.routes)).toBe(true);
      expect(Array.isArray(result.consensus)).toBe(true);
    });

    test('listRoutes returns array', async () => {
      const result = await handlers.listRoutes({});
      expect(Array.isArray(result)).toBe(true);
    });

    test('listTunnels returns array', async () => {
      const result = await handlers.listTunnels({});
      expect(Array.isArray(result)).toBe(true);
    });

    test('listConsensus returns array', async () => {
      const result = await handlers.listConsensus({});
      expect(Array.isArray(result)).toBe(true);
    });

    test('explainRail returns error for unknown rail', async () => {
      await expect(handlers.explainRail({ railId: 'nonexistent-uuid' }))
        .rejects.toThrow('Rail not found');
    });

    test('getRoute returns error for unknown route', async () => {
      await expect(handlers.getRoute({ name: 'nonexistent-route' }))
        .rejects.toThrow('Route not found');
    });
  });

  describe('Rail Handler Routing', () => {
    test('handleRail routes list operation', async () => {
      const result = await handlers.handleRail('list', {});
      expect(result).toHaveProperty('tunnels');
      expect(result).toHaveProperty('routes');
      expect(result).toHaveProperty('consensus');
    });

    test('handleRail routes routes operation', async () => {
      const result = await handlers.handleRail('routes', {});
      expect(Array.isArray(result)).toBe(true);
    });

    test('handleRail routes tunnels operation', async () => {
      const result = await handlers.handleRail('tunnels', {});
      expect(Array.isArray(result)).toBe(true);
    });

    test('handleRail routes consensus operation', async () => {
      const result = await handlers.handleRail('consensus', {});
      expect(Array.isArray(result)).toBe(true);
    });

    test('handleRail throws for unknown operation', async () => {
      await expect(handlers.handleRail('unknown', {}))
        .rejects.toThrow('Unknown rail operation');
    });
  });

  describe('Rail Notifier', () => {
    test('creates RailNotifier with exchange', () => {
      const mockExchange = { sendNotification: jest.fn() };
      const notifier = new RailNotifier(mockExchange);
      expect(notifier.enabled).toBe(true);
      expect(notifier.canNotify).toBe(true);
    });

    test('creates NoOpRailNotifier when disabled', () => {
      const notifier = new NoOpRailNotifier();
      expect(notifier.canNotify).toBe(false);
    });

    test('createRailNotifier returns correct type', () => {
      const mockExchange = { sendNotification: jest.fn() };
      const notifier = createRailNotifier(mockExchange);
      expect(notifier).toBeInstanceOf(RailNotifier);
    });

    test('notifyTunnelMessage sends notification', async () => {
      const mockExchange = { sendNotification: jest.fn().mockResolvedValue(undefined) };
      const notifier = new RailNotifier(mockExchange);

      await notifier.notifyTunnelMessage('tunnel-123', 'agent-a', 'agent-b', { type: 'query' });

      expect(mockExchange.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'notifications/rail.tunnel',
          params: expect.objectContaining({
            tunnelId: 'tunnel-123',
            source: 'agent-a',
            target: 'agent-b'
          })
        })
      );
    });

    test('notifyConsensusUpdate sends notification', async () => {
      const mockExchange = { sendNotification: jest.fn().mockResolvedValue(undefined) };
      const notifier = new RailNotifier(mockExchange);

      await notifier.notifyConsensusUpdate('session-123', 'CONVERGED', 0.95, [
        { source: 'claude', confidence: 0.9 },
        { source: 'gpt-4', confidence: 0.95 }
      ], true);

      expect(mockExchange.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'notifications/rail.consensus',
          params: expect.objectContaining({
            sessionId: 'session-123',
            state: 'CONVERGED',
            agreement: 0.95,
            complete: true
          })
        })
      );
    });

    test('NoOpRailNotifier methods are no-ops', async () => {
      const notifier = new NoOpRailNotifier();

      // These should not throw
      await notifier.notifyTunnelMessage('id', 'a', 'b', {});
      await notifier.notifyConsensusUpdate('id', 'PENDING', 0, []);
    });
  });
});
