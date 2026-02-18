FROM oven/bun:1.2.2

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

EXPOSE $PORT

CMD ["bun", "run", "src/index.ts"]
