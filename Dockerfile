FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Expose the port that the MCP server will run on
EXPOSE 3000

CMD ["npm", "start"]