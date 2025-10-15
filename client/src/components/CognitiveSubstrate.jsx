import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import ComputationGraph from './ComputationGraph';
import { createNet, NodeType } from '../lib/browserInteractionNets';
import { updateMetrics, trace } from '../client/ContextGateway';
import { Gates, enterGate, verify } from '../client/constitution';
import { resolveModelProfile } from '../lib/modelProfiles';
import { GatewayState } from '../client/ContextGateway';

const CognitiveSubstrate = () => {
  const [systemState, setSystemState] = useState({
    entropy: 1.0,
    coherence: 0.0,
    phaseLock: 0.0,
    status: 'IDLE'
  });
  const [userInput, setUserInput] = useState('');
  const [consoleOutput, setConsoleOutput] = useState('System Initialized. Waiting for input to engender thought-vector...\n[Transformers.js] will run inference in browser via WebGPU.\nThis is a live, computational proof of realizability.');
  const [agents, setAgents] = useState(new Map());
  const [agentStates, setAgentStates] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [computationGraph, setComputationGraph] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const lastGraphHashRef = useRef('');
  const rafIdRef = useRef(0);

  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const particlesRef = useRef(null);
  const animationFrameRef = useRef(null);
  const globalTimeRef = useRef(0);
  const velocitiesRef = useRef(null);
  const modelsRef = useRef({ instance: null, modelId: null });

  // AI Model Singleton with profile + fallback (using modelProfiles utilities)
  const getAIModel = async (onProgress) => {
    if (modelsRef.current.instance === null) {
      try {
        const { loadModelWithFallback } = await import('../lib/modelProfiles');
        
        trace({ type: 'model:load:start', profileId: GatewayState.modelProfileId });
        
        const generator = await loadModelWithFallback(
          GatewayState.modelProfileId,
          onProgress || ((progress) => {
            trace({ type: 'model:load:progress', ...progress });
          })
        );
        
        trace({ type: 'model:loaded', profileId: GatewayState.modelProfileId });
        
        modelsRef.current.instance = Promise.resolve(generator);
        modelsRef.current.modelId = GatewayState.modelProfileId;
      } catch (err) {
        trace({ type: 'model:load:error', error: String(err?.message || err) });
        console.error('Failed to load model:', err);
        throw err;
      }
    }
    return modelsRef.current.instance;
  };

  // Agent Class
  class Agent {
    constructor(id, type, systemPrompt) {
      this.id = id;
      this.type = type;
      this.systemPrompt = systemPrompt;
      this.state = 'idle';
      this.history = [];
    }

    async think(userInput, updateUI) {
      this.state = 'thinking';
      updateUI(this.id, this);

      try {
        const model = await getAIModel();
        this.history.push({ role: 'user', content: userInput });

        const prompt = [
          `System: ${this.systemPrompt}`,
          ...this.history.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        ].join('\n');

        // Use inference options from modelProfiles (includes deterministic seed if enabled)
        const { getInferenceOptions } = await import('../lib/modelProfiles');
        const inferenceOpts = getInferenceOptions({
          max_new_tokens: 150,
          temperature: 0.2,
          top_k: 40
        });
        
        const output = await model(prompt, inferenceOpts);

        const result = output && output[0] && output[0].generated_text
          ? String(output[0].generated_text)
          : '';

        this.history.push({ role: 'assistant', content: result });

        this.state = 'idle';
        updateUI(this.id, this);
        return result;
      } catch (error) {
        this.state = 'idle';
        updateUI(this.id, this);
        throw error;
      }
    }
  }

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.0015);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 80;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true
    });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.setClearColor(0x000000, 1);
    rendererRef.current = renderer;

    // Create particle system
    const particleCount = 1500;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const r = 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);
      
      velocities[i3] = (Math.random() - 0.5) * 0.05;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.05;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.05;
      
      colors[i3] = 0.0;
      colors[i3 + 1] = 1.0;
      colors[i3 + 2] = 1.0;
    }

    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    velocitiesRef.current = velocities;

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });

    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);
    particlesRef.current = particles;

    // Handle window resize
    const handleResize = () => {
      if (!canvasRef.current || !cameraRef.current || !rendererRef.current) return;
      
      camera.aspect = canvasRef.current.clientWidth / canvasRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (particlesRef.current) {
        particlesRef.current.dispose();
      }
    };
  }, []);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !particlesRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      globalTimeRef.current += 0.016;

      // Update particle system based on system state
      const positions = particlesRef.current.attributes.position.array;
      const colors = particlesRef.current.attributes.color.array;
      const velocities = velocitiesRef.current;

      const targetEntropy = systemState.status === 'THINKING' ? 0.5 : 1.0;
      const targetCoherence = systemState.status === 'THINKING' ? 0.8 : 0.0;
      const targetPhaseLock = systemState.status === 'THINKING' ? 0.9 : 0.0;

      const nextState = {
        entropy: systemState.entropy + (targetEntropy - systemState.entropy) * 0.05,
        coherence: systemState.coherence + (targetCoherence - systemState.coherence) * 0.05,
        phaseLock: systemState.phaseLock + (targetPhaseLock - systemState.phaseLock) * 0.05
      };
      setSystemState(prev => ({ ...prev, ...nextState }));
      updateMetrics(nextState);

      for (let i = 0; i < positions.length / 3; i++) {
        const i3 = i * 3;

        const randomForce = (1 - systemState.coherence) * 0.1 * systemState.entropy;
        const coherentForce = -positions[i3] * 0.0005 * systemState.coherence;

        velocities[i3] += (Math.random() - 0.5) * randomForce + coherentForce;
        velocities[i3 + 1] += (Math.random() - 0.5) * randomForce;
        velocities[i3 + 2] += (Math.random() - 0.5) * randomForce;

        velocities[i3] *= (0.98 - systemState.phaseLock * 0.05);
        velocities[i3 + 1] *= (0.98 - systemState.phaseLock * 0.05);
        velocities[i3 + 2] *= (0.98 - systemState.phaseLock * 0.05);

        positions[i3] += velocities[i3];
        positions[i3 + 1] += velocities[i3 + 1];
        positions[i3 + 2] += velocities[i3 + 2];

        const dist = Math.sqrt(positions[i3]**2 + positions[i3+1]**2 + positions[i3+2]**2);
        if (dist > 70) {
          velocities[i3] *= -0.5;
          velocities[i3 + 1] *= -0.5;
          velocities[i3 + 2] *= -0.5;
        }

        colors[i3] = systemState.phaseLock;
        colors[i3 + 1] = 1.0 - systemState.coherence;
        colors[i3 + 2] = 1.0;
      }

      particlesRef.current.attributes.position.needsUpdate = true;
      particlesRef.current.attributes.color.needsUpdate = true;

      cameraRef.current.position.x = Math.sin(globalTimeRef.current * 0.05) * 80;
      cameraRef.current.position.z = Math.cos(globalTimeRef.current * 0.05) * 80;
      cameraRef.current.lookAt(0, 0, 0);

      rendererRef.current.render(sceneRef.current, cameraRef.current);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [systemState.status, systemState.coherence, systemState.entropy, systemState.phaseLock]);

  // Initialize agents
  useEffect(() => {
    const plannerAgent = new Agent(
      'planner',
      'Planner',
      'You are a meticulous planning agent. You break down user requests into simple, logical steps. Be concise.'
    );

    const synthesizerAgent = new Agent(
      'synthesizer',
      'Synthesizer',
      'You are a creative and articulate synthesizer. You take a plan and a user request and generate a comprehensive, helpful response.'
    );

    const agentMap = new Map();
    agentMap.set('planner', plannerAgent);
    agentMap.set('synthesizer', synthesizerAgent);
    setAgents(agentMap);

    setAgentStates({
      planner: { state: 'idle' },
      synthesizer: { state: 'idle' }
    });
  }, []);

  const updateAgentUI = (agentId, agent) => {
    setAgentStates(prev => ({
      ...prev,
      [agentId]: { state: agent.state }
    }));
  };

  const logToConsole = (message) => {
    setConsoleOutput(prev => prev + '\n' + message);
  };

  const handleSubmit = async () => {
    if (!userInput.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSystemState(prev => ({ ...prev, status: 'THINKING' }));
    trace({ type: 'input:submitted', text: userInput });
    enterGate(Gates.OBSERVE, { q: userInput });
    logToConsole(`\nUSER > ${userInput}`);

    try {
      const net = createNet();
      setComputationGraph(net);

      const rootNode = net.createNode(NodeType.ROOT, { query: userInput });
      const next = net.toJSON();
      const h = JSON.stringify(next).length.toString(36);
      if (h !== lastGraphHashRef.current) {
        lastGraphHashRef.current = h;
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(() => setGraphData(next));
      }

      const planner = agents.get('planner');
      const synthesizer = agents.get('synthesizer');

      if (!planner || !synthesizer) {
        logToConsole('ERROR > Agents not initialized');
        return;
      }

      enterGate(Gates.ABSTRACT, {});
      trace({ type: 'graph:node:create', role: 'planner' });
      const planNode = net.createNode(NodeType.AGENT, { agent: 'planner', status: 'thinking' });
      net.connect(rootNode, planNode);
      {
        const next = net.toJSON();
        const h = JSON.stringify(next).length.toString(36);
        if (h !== lastGraphHashRef.current) {
          lastGraphHashRef.current = h;
          if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = requestAnimationFrame(() => setGraphData(next));
        }
      }

      const plan = await planner.think(
        `Given the user request "${userInput}", create a short, step-by-step plan for a 'Synthesizer' agent to follow.`,
        updateAgentUI
      );
      logToConsole(`PLANNER > ${plan}`);

      net.nodes.get(planNode).value = { agent: 'planner', result: plan.substring(0, 50) };
      // Throttled graph update using RAF
      {
        const next = net.toJSON();
        const h = JSON.stringify(next).length.toString(36);
        if (h !== lastGraphHashRef.current) {
          lastGraphHashRef.current = h;
          if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = requestAnimationFrame(() => setGraphData(next));
        }
      }

      enterGate(Gates.DECIDE, {});
      trace({ type: 'graph:node:create', role: 'synthesizer' });
      const synthNode = net.createNode(NodeType.AGENT, { agent: 'synthesizer', status: 'thinking' });
      net.connect(planNode, synthNode);
      {
        const next = net.toJSON();
        const h = JSON.stringify(next).length.toString(36);
        if (h !== lastGraphHashRef.current) {
          lastGraphHashRef.current = h;
          if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = requestAnimationFrame(() => setGraphData(next));
        }
      }

      const finalResponse = await synthesizer.think(
        `Following this plan: "${plan}". Fulfill the original user request: "${userInput}"`,
        updateAgentUI
      );
      logToConsole(`SYNTHESIZER > ${finalResponse}`);

      net.nodes.get(synthNode).value = { agent: 'synthesizer', result: finalResponse.substring(0, 50) };
      // Throttled graph update using RAF
      {
        const next = net.toJSON();
        const h = JSON.stringify(next).length.toString(36);
        if (h !== lastGraphHashRef.current) {
          lastGraphHashRef.current = h;
          if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = requestAnimationFrame(() => setGraphData(next));
        }
      }

      const ok = verify(finalResponse, {});
      if (ok) enterGate(Gates.VERIFY, {});

      logToConsole(`\nGRAPH STATS > ${JSON.stringify(net.getStats())}`);

    } catch (error) {
      logToConsole(`ERROR > ${error.message}`);
      trace({ type: 'error', message: error.message });
      console.error(error);
    } finally {
      setSystemState(prev => ({ ...prev, status: 'IDLE' }));
      setIsSubmitting(false);
      setUserInput('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Three.js Canvas */}
      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 w-full h-full"
        style={{ zIndex: 0, pointerEvents: 'none' }}
      />

      {/* Main Factory Panel */}
      <div
        className="absolute top-5 left-5 w-[420px] max-h-[calc(100vh-40px)] overflow-y-auto"
        style={{
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(12px)',
          borderRadius: '6px',
          padding: '12px',
          zIndex: 10,
          fontFamily: "'SF Mono', 'Courier New', monospace",
          fontSize: '11px',
          color: '#00ffff',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '8px',
            paddingBottom: '6px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.5px'
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#ffd700',
              boxShadow: '0 0 8px #ffd700',
              marginRight: '6px'
            }}
          />
          <span style={{ flex: 1, color: '#ffd700', textShadow: '0 0 8px #ffd700' }}>
            COGNITIVE SUBSTRATE
          </span>
        </div>

        {/* Agents */}
        <div>
          {Array.from(agents.entries()).map(([agentId, agent]) => (
            <div
              key={agentId}
              className={agentStates[agentId]?.state === 'thinking' ? 'agent-thinking' : ''}
              style={{
                margin: '6px 0',
                padding: '8px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '4px',
                borderLeft: agentStates[agentId]?.state === 'thinking' 
                  ? '2px solid #ff00ff' 
                  : '2px solid #00ffff',
                fontSize: '10px',
                transition: 'all 0.3s',
                opacity: agentStates[agentId]?.state === 'thinking' ? 0.7 : 1,
                animation: agentStates[agentId]?.state === 'thinking' 
                  ? 'pulse 2s ease-in-out infinite' 
                  : 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', fontWeight: 500 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#ffd700',
                    boxShadow: '0 0 8px #ffd700',
                    marginRight: '6px'
                  }}
                />
                <span style={{ flex: 1, fontSize: '10px' }}>{agentId.toUpperCase()}</span>
                <span style={{ color: '#888', fontSize: '9px' }}>{agent.type.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '9px', color: '#888', marginTop: '4px', fontStyle: 'italic' }}>
                {agentStates[agentId]?.state === 'thinking' ? (
                  <>
                    Thinking
                    <span style={{ display: 'inline-flex', gap: '3px', marginLeft: '6px' }}>
                      <span className="loading-dot" />
                      <span className="loading-dot" style={{ animationDelay: '0.2s' }} />
                      <span className="loading-dot" style={{ animationDelay: '0.4s' }} />
                    </span>
                  </>
                ) : 'Idle'}
              </div>
            </div>
          ))}
        </div>

        {/* Metrics */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '6px',
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        >
          <div style={{ fontSize: '9px' }}>
            <span style={{ color: '#888', display: 'block' }}>Entropy</span>
            <span style={{ color: '#00ffff', fontWeight: 600, fontSize: '11px' }}>
              {systemState.entropy.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: '9px' }}>
            <span style={{ color: '#888', display: 'block' }}>Coherence</span>
            <span style={{ color: '#00ffff', fontWeight: 600, fontSize: '11px' }}>
              {systemState.coherence.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: '9px' }}>
            <span style={{ color: '#888', display: 'block' }}>Phase Lock</span>
            <span style={{ color: '#00ffff', fontWeight: 600, fontSize: '11px' }}>
              {systemState.phaseLock.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: '9px' }}>
            <span style={{ color: '#888', display: 'block' }}>System State</span>
            <span style={{ color: '#00ffff', fontWeight: 600, fontSize: '11px' }}>
              {systemState.status}
            </span>
          </div>
        </div>

        {/* Input Group */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Input to the manifold..."
            disabled={isSubmitting}
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#00ffff',
              padding: '8px',
              borderRadius: '4px',
              fontFamily: 'inherit',
              fontSize: '11px',
              outline: 'none'
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid #00ffff',
              color: '#00ffff',
              padding: '8px 12px',
              borderRadius: '4px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: isSubmitting ? 0.5 : 1
            }}
          >
            Submit
          </button>
        </div>

        {/* Output Console */}
        <div
          style={{
            marginTop: '12px',
            padding: '8px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '4px',
            maxHeight: '200px',
            overflowY: 'auto',
            fontSize: '10px',
            lineHeight: 1.5,
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        >
          <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: 0 }}>
            {consoleOutput}
          </pre>
        </div>
      </div>

      {/* Computation Graph Visualization */}
      {graphData && (
        <div
          className="absolute bottom-5 right-5"
          style={{
            width: '400px',
            height: '300px',
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(12px)',
            borderRadius: '6px',
            padding: '12px',
            zIndex: 10,
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        >
          <div style={{
            fontSize: '10px',
            fontWeight: 600,
            marginBottom: '8px',
            color: '#ffd700',
            letterSpacing: '0.5px'
          }}>
            COMPUTATION GRAPH
          </div>
          <div style={{ height: 'calc(100% - 30px)' }}>
            <ComputationGraph graphData={graphData} />
          </div>
        </div>
      )}

      {/* Inline styles for animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @keyframes loadingBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        .loading-dot {
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #00ffff;
          animation: loadingBounce 1.4s ease-in-out infinite;
        }
        .agent-thinking {
          animation: pulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default CognitiveSubstrate;

