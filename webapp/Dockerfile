# 1. Сборка Mini App
FROM node:22-alpine AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# 2. Nginx: статика Mini App + reverse proxy на API
FROM nginx:1.27-alpine
COPY --from=build /web/dist /usr/share/nginx/html
COPY nginx/http.conf.template nginx/https.conf.template nginx/app.locations /etc/nginx/zerno/
COPY nginx/entrypoint.sh /zerno-entrypoint.sh
RUN chmod +x /zerno-entrypoint.sh && rm -f /etc/nginx/conf.d/default.conf
EXPOSE 80 443
ENTRYPOINT ["/zerno-entrypoint.sh"]
