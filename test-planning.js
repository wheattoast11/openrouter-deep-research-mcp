const planningAgent = require('./src/agents/planningAgent');

async function test() {
    console.log('Testing PlanningAgent...');
    try {
        const plan = await planningAgent.planResearch('What is the current status of Agent Zero v1.15.0?');
        console.log('Plan generated:');
        console.log(plan);
        
        const agentRegex = /<agent_(\d+)>([\s\S]*?)<\/agent_\d+>/g;
        let match;
        while ((match = agentRegex.exec(plan)) !== null) {
            console.log(`- Agent ${match[1]}: ${match[2].trim()}`);
        }
    } catch (e) {
        console.error('Planning failed:', e);
    }
}

test();
