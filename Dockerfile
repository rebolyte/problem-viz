FROM oven/bun:1-alpine AS base
WORKDIR /usr/src/app

# install dev + prod deps into separate temp dirs for caching
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# build: generate unocss styles ahead of time, inject into HTML
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
RUN bunx unocss "src/**/*.{ts,tsx}" "index.html" -o uno.css
RUN sed -i 's|</head>|<link rel="stylesheet" href="./uno.css">\n</head>|' index.html

# production: no bunfig/unocss plugin needed, CSS already built
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/uno.css .
COPY --from=prerelease /usr/src/app/index.html .
COPY --from=prerelease /usr/src/app/package.json .
COPY --from=prerelease /usr/src/app/tsconfig.json .
COPY --from=prerelease /usr/src/app/server.ts .
COPY --from=prerelease /usr/src/app/migrate.ts .
COPY --from=prerelease /usr/src/app/src ./src
COPY --from=prerelease /usr/src/app/migrations ./migrations

RUN mkdir -p /usr/src/app/data && chown bun:bun /usr/src/app/data

USER bun
ENV DATABASE_PATH=/usr/src/app/data/workspace.sqlite
EXPOSE 3000/tcp
CMD ["sh", "-c", "bun migrate.ts && bun server.ts"]
