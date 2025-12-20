FROM node:20-alpine AS base
WORKDIR /app
ENV APP_PORT=5173

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source
COPY . .

EXPOSE ${APP_PORT}

CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"production\" ]; then npm run build && npm run preview -- --host --port ${APP_PORT}; else npm run dev -- --host --port ${APP_PORT}; fi"]
