FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
RUN npm ci --omit=dev
COPY server/src ./server/src
COPY index.html ./index.html
COPY css ./css
COPY js ./js
COPY pages ./pages
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/src/index.js"]
