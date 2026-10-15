"""
Training callbacks for safety violation tracking and evaluation logging.
"""
try:
    from stable_baselines3.common.callbacks import BaseCallback
    HAS_SB3 = True
except ImportError:
    HAS_SB3 = False
    class BaseCallback:
        def __init__(self, verbose=0): self.verbose = verbose

class SafetyAuditCallback(BaseCallback):
    """
    Logs safety validation breaches and reward convergence during RL training rollouts.
    """
    def __init__(self, check_freq: int = 1000, verbose: int = 1):
        super().__init__(verbose)
        self.check_freq = check_freq
        self.violations_count = 0
        self.total_actions = 0

    def _on_step(self) -> bool:
        self.total_actions += 1
        # Extract environment info if available
        if hasattr(self, "locals") and "infos" in self.locals:
            for info in self.locals["infos"]:
                if not info.get("validation_passed", True):
                    self.violations_count += 1

        if self.n_calls % self.check_freq == 0 and self.verbose > 0:
            rate = (self.violations_count / max(1, self.total_actions)) * 100.0
            print(f"[SafetyAudit] Step {self.n_calls}: Violation Rate = {rate:.3f}% ({self.violations_count}/{self.total_actions})")
        return True
