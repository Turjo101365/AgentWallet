"""
FastAPI application for the AgentWallet RL advisory engine.
"""
from fastapi import FastAPI

from .api.routes import router
from .config import DEBUG

app = FastAPI(
    title="AgentWallet RL Engine",
    description="Advisory PPO/DQN inference and simulation. Not a safety authority; never moves funds.",
    version="1.1.0",
    debug=DEBUG,
)
# No CORS middleware: only the backend calls this service, server-to-server.
app.include_router(router)


@app.get("/")
def root():
    return {"service": "AgentWallet RL Engine", "version": "1.1.0", "docs_url": "/docs", "health_check": "/health"}


if __name__ == "__main__":
    import uvicorn

    from .config import HOST, PORT

    uvicorn.run("app.main:app", host=HOST, port=PORT)
