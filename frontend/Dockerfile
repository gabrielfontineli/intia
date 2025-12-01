FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./

RUN npm install

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

RUN npm install --omit=dev

# Expose port
EXPOSE 3000

ENV NODE_ENV=production

# Run the application
CMD ["node", "build"]
