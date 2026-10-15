import { apiRequest } from './apiClient.js';

export const rlService = {
  async getModels() {
    return await apiRequest('/rl/models');
  },

  async selectModel(agentType) {
    return await apiRequest('/rl/models/select', {
      method: 'POST',
      body: JSON.stringify({ agentType }),
    });
  },

  async evaluateAgent(agentType = 'PPO', episodes = 10) {
    return await apiRequest('/rl/evaluate', {
      method: 'POST',
      body: JSON.stringify({ agentType, episodes }),
    });
  },
};
