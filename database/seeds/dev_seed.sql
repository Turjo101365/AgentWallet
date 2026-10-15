-- AgentWallet Development Seed Script
-- Registers the model definitions without fabricating any fake wallet transactions or balances.

INSERT INTO agent_models (model_id, agent_type, version, checkpoint_path, action_space_size, observation_dim, trained_steps, is_active, metrics)
VALUES 
  ('ppo-default', 'PPO', 'AgentPolicy_v2.4_PPO', 'models/ppo/best_model.zip', 4, 8, 100000, TRUE, '{"mean_reward": 4.12, "sharpe": 1.84, "violation_rate": 0.001}'::jsonb),
  ('dqn-default', 'DQN', 'AgentPolicy_v1.8_DQN', 'models/dqn/best_model.zip', 4, 8, 100000, FALSE, '{"mean_reward": 3.78, "sharpe": 1.55, "violation_rate": 0.003}'::jsonb)
ON CONFLICT (model_id) DO UPDATE 
SET updated_at = CURRENT_TIMESTAMP;
