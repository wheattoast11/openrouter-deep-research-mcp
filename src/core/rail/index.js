/**
 * Rail Protocol - Unified Exports
 *
 * Seamless inter-agent communication with tunnels, consensus, and routing.
 *
 * @module core/rail
 */

'use strict';

const rail = require('../rail');
const tunnel = require('./tunnel');
const consensus = require('./consensus');
const routes = require('./routes');
const pipeline = require('./pipeline');

module.exports = {
  // Core Rail types
  Rail: rail.Rail,
  Token: rail.Token,
  Switch: rail.Switch,
  Ok: rail.Ok,
  Err: rail.Err,
  BackpressureError: rail.BackpressureError,
  RailClosedError: rail.RailClosedError,
  tokenFromSignal: rail.tokenFromSignal,
  signalFromToken: rail.signalFromToken,

  // Tunnel (agent-to-agent messaging)
  Tunnel: tunnel.Tunnel,
  TunnelRegistry: tunnel.TunnelRegistry,
  tunnelRegistry: tunnel.registry,
  TUNNEL_NOTIFICATION: tunnel.NOTIFICATION_TYPE,

  // Streaming Consensus
  ConsensusState: consensus.ConsensusState,
  StreamingConsensus: consensus.StreamingConsensus,
  ConsensusManager: consensus.ConsensusManager,
  consensusManager: consensus.manager,
  CONSENSUS_NOTIFICATION: consensus.NOTIFICATION_TYPE,

  // Routes (user-definable routing)
  Route: routes.Route,
  RouteRegistry: routes.RouteRegistry,
  RouteOperator: routes.RouteOperator,
  RouteDimension: routes.RouteDimension,
  routeRegistry: routes.registry,
  ROUTE_RESOURCE_PREFIX: routes.RESOURCE_PREFIX,

  // Pipeline execution
  Pipeline: pipeline.Pipeline,
  PipelineBuilder: pipeline.PipelineBuilder,
  StageType: pipeline.StageType
};
