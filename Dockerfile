FROM buildkite/puppeteer
WORKDIR /app
COPY ./src /app
RUN npm install --only=production
EXPOSE 8080
CMD ["node", "server.js"]
