FROM buildkite/puppeteer:10.0.0
WORKDIR /app
COPY ./src /app
RUN npm install --only=production
EXPOSE 8080
CMD ["node", "server.js"]
