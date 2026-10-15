import React, { useState } from 'react';
import { AgentSelector } from '../components/rl/AgentSelector.jsx';
import { PPOInsights } from '../components/rl/PPOInsights.jsx';
import { DQNInsights } from '../components/rl/DQNInsights.jsx';
import { ComparisonChart } from '../components/rl/ComparisonChart.jsx';
import { Button } from '../components/ui/Button.jsx';
import { rlService } from '../services/rlService.js';

export function RLInsights() {
  const [activeAgent, setActiveAgent] = useState('PPO');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState(null);

  const handleSelectAgent = async (agent) => {
    setActiveAgent(agent);
    try {
      await rlService.selectModel(agent);
    } catch (e) {
      console.warn('Could not update active model on backend:', e.message);
    }
  };

  const handleRunBenchmark = async () => {
    setIsEvaluating(true);
    try {
      const res = await rlService.evaluateAgent(activeAgent, 10);
      setEvaluationResult(res);
      alert(`Benchmark completed for ${activeAgent}! Mean Reward: ${res.evaluation?.mean_reward}`);
    } catch (err) {
      alert(`Evaluation error: ${err.message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
            Reinforcement Learning Insights & Benchmarks
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Empirical comparative evaluation between Proximal Policy Optimization (PPO) and Deep Q-Networks (DQN).
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={handleRunBenchmark}
          disabled={isEvaluating}
          icon="play_arrow"
        >
          {isEvaluating ? 'Simulating Rollout...' : `Benchmark ${activeAgent} (10 Episodes)`}
        </Button>
      </div>

      <AgentSelector
        activeAgent={activeAgent}
        onSelect={handleSelectAgent}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <PPOInsights />
        <DQNInsights />
      </div>

      <ComparisonChart />
    </div>
  );
}
