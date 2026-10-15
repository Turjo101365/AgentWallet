import { rlClient } from '../services/rlClient.js';
import { agentOrchestrator } from '../services/agentOrchestrator.js';

export async function listModels(req, res, next) {
  try {
    const models = await rlClient.getModels();
    res.json({
      success: true,
      data: models,
      activeAgent: agentOrchestrator.activeAgent,
    });
  } catch (err) {
    next(err);
  }
}

export async function selectActiveModel(req, res, next) {
  try {
    const { agentType } = req.body;
    if (!['PPO', 'DQN'].includes(agentType?.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: { message: 'agentType must be either PPO or DQN' },
      });
    }

    agentOrchestrator.activeAgent = agentType.toUpperCase();
    await rlClient.selectModel(agentType.toUpperCase());

    res.json({
      success: true,
      data: {
        activeAgent: agentOrchestrator.activeAgent,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function evaluateModel(req, res, next) {
  try {
    const { agentType, episodes } = req.body;
    const results = await rlClient.evaluateAgent(agentType || 'PPO', episodes || 10);
    res.json({
      success: true,
      data: results,
    });
  } catch (err) {
    next(err);
  }
}
