FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG VITE_USE_MOCKS=false
ARG VITE_DEMO=false
ARG VITE_STUDENT_API_ENABLED=true
ARG VITE_ARM_API_URL=/student-api
ARG VITE_AUTH_API_URL=/auth-api
ARG VITE_REALTIME_GATEWAY_URL=/realtime-gateway
ARG VITE_MOCK_AI=false
ARG VITE_MOCK_ASSIGNMENTS=false
ARG VITE_MOCK_CALL_TRANSCRIPT=false
ARG VITE_MOCK_CARD_TIMELINE=false
ARG VITE_MOCK_EXPERT_REVIEW=false
ARG VITE_MOCK_GROUPS=false
ARG VITE_MOCK_MONITORING=false
ARG VITE_MOCK_SCENARIOS=false
ARG VITE_MOCK_SERVICES=false
ARG VITE_MOCK_STUDENTS=false
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/http.conf.template /etc/nginx/http.conf.template
COPY nginx/https.conf.template /etc/nginx/https.conf.template
COPY nginx/proxy.conf /etc/nginx/proxy.conf
COPY nginx/start.sh /start.sh
ENTRYPOINT ["/bin/sh", "/start.sh"]
