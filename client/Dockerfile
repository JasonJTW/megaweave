FROM node:22

WORKDIR /app

#Install app dependencies
COPY package.json package-lock.json ./
RUN npm install

# Bundle app source
COPY . .

# Compile typescript to javascript
RUN npm run build

#Set the port via env var
ENV PORT=8282

EXPOSE 8282
CMD [ "npm", "run", "start"]

