#parent image
FROM node:lts
WORKDIR /app
COPY . /app
RUN npm install yarn -g
RUN yarn install
RUN yarn add nodemon -g
# network
CMD ["yarn", "start"]
