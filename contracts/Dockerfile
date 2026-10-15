# Local Hardhat chain (chain id 31337) and the one-shot local deployer. Never used for public networks.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY hardhat.config.js ./
COPY src src
COPY scripts scripts
RUN npx hardhat compile
EXPOSE 8545
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0"]
