FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt requirements-train.txt ./
# Checkpoint loading needs stable-baselines3 + torch (CPU). Set false for a slim image that reports policies unavailable.
ARG INSTALL_TRAINING=true
RUN pip install --no-cache-dir -r requirements.txt && \
    if [ "$INSTALL_TRAINING" = "true" ]; then pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements-train.txt; fi
COPY app app
COPY configs configs
COPY models models
COPY scripts/package_models.py scripts/package_models.py
# Fail the production image build when a checkpoint is absent or mismatched.
RUN python scripts/package_models.py --output /tmp/models.zip && rm /tmp/models.zip
RUN useradd --create-home rl && mkdir -p models && chown -R rl:rl /app
USER rl
ENV HOST=0.0.0.0 PORT=8000 MODEL_DIR=/app/models OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host $HOST --port $PORT"]
