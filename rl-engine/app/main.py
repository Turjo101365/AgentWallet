"""
FastAPI Main Application for AgentWallet RL Engine.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .config import DEBUG

app = FastAPI(
    title="AgentWallet RL Engine Microservice",
    description="Inference, training, and evaluation service for PPO and DQN treasury policies",
    version="1.0.0",
    debug=DEBUG
)

# Enable CORS for internal microservice and dashboard interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.get("/")
def root():
    return {
        "service": "AgentWallet Reinforcement Learning Microservice",
        "version": "1.0.0",
        "docs_url": "/docs",
        "health_check": "/health"
    }

if __name__ == "__main__":
    import uvicorn
    from .config import HOST, PORT
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
