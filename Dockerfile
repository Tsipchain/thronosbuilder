FROM node:18-slim

# Install git (needed for cloning repos to inspect project structure)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set up app
WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY . .

EXPOSE 8080

CMD ["node", "src/index.js"]
