import { useState, useEffect, useCallback } from 'react';
import { agentService } from '../services/agentService.js';

export function useAgent(pollIntervalMs = 8000) {
  const [status, setStatus] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAgentData = useCallback(async () => {
    try {
      const [agentStatus, recentProposals] = await Promise.all([
        agentService.getStatus().catch(() => null),
        agentService.listProposals().catch(() => []),
      ]);
      setStatus(agentStatus);
      setProposals(recentProposals || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchAgentData();
    const interval = setInterval(fetchAgentData, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchAgentData, pollIntervalMs]);

  const triggerEvaluation = async (agentType = null) => {
    setIsLoading(true);
    try {
      const newProposal = await agentService.triggerEvaluation(agentType);
      await fetchAgentData();
      return newProposal;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const approveProposal = async (decisionId, signerAddress) => {
    setIsLoading(true);
    try {
      const result = await agentService.approveProposal(decisionId, signerAddress);
      await fetchAgentData();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const rejectProposal = async (decisionId, reason) => {
    setIsLoading(true);
    try {
      const result = await agentService.rejectProposal(decisionId, reason);
      await fetchAgentData();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const togglePause = async (targetState = null) => {
    setIsLoading(true);
    try {
      const res = await agentService.togglePause(targetState);
      await fetchAgentData();
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const isPaused = Boolean(status?.isPaused);

  return {
    status,
    isPaused,
    proposals,
    pendingProposal: proposals.find((p) => p.authorization?.status === 'AWAITING_APPROVAL') || null,
    isLoading,
    error,
    refresh: fetchAgentData,
    triggerEvaluation,
    approveProposal,
    rejectProposal,
    togglePause,
  };
}
