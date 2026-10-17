import { createDemoSandbox } from './demoSandbox.js';
import { createDemoService } from '../services/demoService.js';
import { createRelayGuard } from './relayGuard.js';

/**
 * Starts the judge demo wallet next to the read-only judge service. A failed startup check (wrong owner/agent,
 * wrong version, unreachable chain) disables the demo with a generic reason instead of taking the judge site down.
 */
export async function createDemoRuntime(config, { db, llm, logger, provider, extraEnv,publicAiGate } = {}) {
  let sandbox;
  try {
    sandbox = await createDemoSandbox(config.demo, { ...config, extraEnv }, { logger, llm, provider });
    await sandbox.container.policySettings.update({autoApprovalMaxPerTx:{'0x0000000000000000000000000000000000000000':config.demo.maxAmountWei.toString()}},config.demo.ownerAddress,{allowLoosening:true,via:'approved-demo-ceiling'});
    const service = createDemoService({ demo: config.demo, sandbox, budgetDb: db, aiDailyLimit: config.publicAi.dailyLimit, logger,publicAiGate });
    await service.init();
    const bindGuard = createRelayGuard({ db, demo: config.demo, settingsDb:sandbox.container.db });
    sandbox.container.executor.setSandboxGuard(bindGuard(sandbox.container, service.executionSubject));
    // Finish anything the owner key had already approved before a restart; nothing new is authorized here.
    const recovered = await sandbox.container.executor.recover().catch((e) => ({ error: e.message }));
    logger.info('Demo sandbox ready', { contract: config.demo.contractAddress, recovered });
    return { sandbox, service, bindGuard, close: () => sandbox.container.close() };
  } catch (err) {
    await sandbox?.container.close().catch(() => {});
    logger.error('Demo sandbox unavailable', { error: err.message });
    return { sandbox: null, service: null, reason: 'The demo wallet failed its startup checks', close: async () => {} };
  }
}
