# syntax=docker/dockerfile:1

# ---------- build stage ----------
# node:24 for its npm 11. package-lock.json is written by npm 11, and npm 10
# resolves this tree's nested vite peer dependency differently — `npm ci`
# fails on npm 10 with a lockfile npm 11 considers in sync.
FROM node:24-alpine AS builder

WORKDIR /app

# `npm ci` installs exactly what package-lock.json pins and fails if the lock
# and manifest disagree — which is what you want in a build, unlike
# `npm install`, which may silently resolve something new.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines env vars at build time, so the API base URL is baked into the
# bundle here rather than read at runtime. The default '/api' means the browser
# calls the same origin that served the page, and nginx proxies it to the
# backend — no CORS, no hard-coded hostname. Override only for a deployment
# where the API lives on a different origin.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# `npm run build` is `tsc && vite build`, so a type error fails the image build
# instead of shipping.
RUN npm run build

# ---------- runtime stage ----------
FROM nginx:1.27-alpine AS runtime

# Drop the stock default site; ours replaces it.
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx-security-headers.conf /etc/nginx/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
