FROM node:26-alpine

ENV CI=true

# Install matching pnpm
RUN npm install -g pnpm@11.5.1

WORKDIR /app

# Copy package definitions and pnpm workspace settings (contains allowBuilds)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

# Install dependencies for the container platform
RUN pnpm install --frozen-lockfile

# Copy project files
COPY . .

# Expose API port
EXPOSE 3001

# Run development server with watch mode
CMD ["pnpm", "dev"]