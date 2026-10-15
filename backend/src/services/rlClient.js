import { config } from '../config/env.js';

class RLClient {
  constructor(baseUrl = config.rlServiceUrl) {
    this.baseUrl = baseUrl;
  }

  async getHealth() {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return { status: 'unavailable', error: err.message };
    }
  }

  async getModels() {
    try {
      const res = await fetch(`${this.baseUrl}/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return [
        { name: 'PPO', version: 'AgentPolicy_v2.4_PPO', is_active: true, is_loaded: false },
        { name: 'DQN', version: 'AgentPolicy_v1.8_DQN', is_active: false, is_loaded: false }
      ];
    }
  }

  async selectModel(agentType) {
    try {
      const res = await fetch(`${this.baseUrl}/models/select?agent_type=${agentType}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return { status: 'fallback', active_agent: agentType };
    }
  }

  async proposeAction(rawState, agentType = null, recipientOverride = null) {
    try {
      const res = await fetch(`${this.baseUrl}/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_state: rawState,
          agent_type: agentType,
          recipient_override: recipientOverride
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[RLClient Warning]: RL service unavailable at', this.baseUrl, err.message);
      return null;
    }
  }

  async evaluateAgent(agentType = 'PPO', episodes = 10) {
    try {
      const res = await fetch(`${this.baseUrl}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_type: agentType, episodes })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return { error: 'RL service unavailable for evaluation' };
    }
  }
}

export const rlClient = new RLClient();
