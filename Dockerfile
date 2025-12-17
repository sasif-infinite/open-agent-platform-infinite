FROM node:20-alpine

# Install build dependencies for native modules
RUN apk add --no-cache make gcc g++ python3

WORKDIR /app

COPY package.json yarn.lock ./
COPY .yarnrc.yml .yarnrc.yml

COPY apps/ ./apps/
# COPY packages/ ./packages/
COPY turbo.json ./

RUN corepack enable && corepack prepare yarn@3.5.1 --activate
RUN yarn install --immutable

COPY . .

ENV NODE_ENV=production

# Build the web workspace
RUN yarn workspace @open-agent-platform/web build

EXPOSE 3000

CMD ["yarn", "workspace", "@open-agent-platform/web", "start"]
