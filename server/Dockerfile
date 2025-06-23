FROM node:22


#* Receive build arguments for stage setting
ARG STAGE=production

WORKDIR /usr/src/app


# Install app dependencies
COPY package.json package-lock.json ./
RUN npm install

# Bundle app source
COPY . .

# Compile typescript to javascript
RUN npm run build

EXPOSE 8181

CMD [ "node", "dist/server.js" ]