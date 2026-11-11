FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Never reuse a stale TypeScript incremental build cache in Docker.
RUN rm -f tsconfig.tsbuildinfo
ARG VITE_APP_ENV=local
ARG VITE_APP_NAME="Youth Quest"
ARG VITE_API_URL=/api
ARG VITE_ENABLE_PWA=true
ARG VITE_ENABLE_QUICK_LOGIN=false
ARG VITE_PUBLIC_APP_URL=http://localhost:5174
ENV VITE_APP_ENV=$VITE_APP_ENV VITE_APP_NAME=$VITE_APP_NAME VITE_API_URL=$VITE_API_URL VITE_ENABLE_PWA=$VITE_ENABLE_PWA VITE_ENABLE_QUICK_LOGIN=$VITE_ENABLE_QUICK_LOGIN VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
