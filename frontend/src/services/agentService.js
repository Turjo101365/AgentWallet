import { apiRequest } from './apiClient.js';

export const agentService = {
  async getStatus() {
    return await apiRequest('/agent/status');
  },

  async triggerEvaluation(agentType = null) {
    return await apiRequest('/agent/evaluate', {
      method: 'POST',
      body: JSON.stringify({ agentType }),
    });
  },

  async listProposals(limit = 20) {
    return await apiRequest(`/agent/proposals?limit=${limit}`);
  },

  async approveProposal(decisionId, signerAddress) {
    return await apiRequest(`/agent/proposals/${decisionId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ signerAddress }),
    });
  },

  async rejectProposal(decisionId, reason) {
    return await apiRequest(`/agent/proposals/${decisionId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async togglePause(isPaused = null) {
    return await apiRequest('/agent/toggle-pause', {
      method: 'POST',
      body: JSON.stringify({ isPaused }),
    });
  },
};
