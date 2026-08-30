FROM node:22-bookworm-slim

WORKDIR /app

# The editor/Windows machine has Bookman Old Style, but the Cloud Run Linux
# container does not. Debian's fonts-urw-base35 provides URW Bookman and its
# fontconfig aliases include "Bookman Old Style" -> "URW Bookman".
RUN apt-get update \
    && apt-get install -y --no-install-recommends fontconfig fonts-urw-base35 \
    && fc-cache -f -v \
    && fc-match "URW Bookman" \
    && fc-list | grep -i "Bookman" \
    && fc-match "Bookman Old Style" \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --ignore-scripts

COPY . .

RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "start"]
