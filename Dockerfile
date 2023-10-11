#parent image
FROM node:lts
WORKDIR /app
COPY . /app
RUN npm install
# network
CMD ["npm", "start"]
