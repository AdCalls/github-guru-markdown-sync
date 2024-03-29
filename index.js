const axios = require("axios");
const SHA256 = require("crypto-js/sha256");
const core = require("@actions/core");
const markdownit = require("markdown-it");

const repo = process.env.REPO_NAME;
const readme = process.env.README;
const collectionId = process.env.GURU_COLLECTION_ID;
const folderId = process.env.GURU_FOLDER_ID;
const email = process.env.GURU_USER_EMAIL;
const guruToken = process.env.GURU_USER_TOKEN;

const markdownParser = markdownit({
  html: true,
  breaks: true,
  linkify: true,
});

function getClient() {
  const instance = axios.create({
    baseURL: "https://api.getguru.com/api/v1",
    headers: { Authorization: "Basic " + btoa(email + ":" + guruToken) },
  });
  return instance;
}

async function getCards(cardTitle) {
  var payload = {
    queryType: "cards",
    collectionIds: [collectionId],
  };
  if (folderId) {
    payload["query"] = {
      nestedExpressions: [
        {
          type: "board-ids",
          ids: [folderId],
        },
      ],
      op: "AND",
      type: "grouping",
    };
  }

  return await getClient()
    .post("/search/cardmgr", payload)
    .then((response) => {
      if (typeof response.data === "string") {
        return false;
      }
      return response.data.filter((cardInfo) => {
        return cardInfo.preferredPhrase === cardTitle ? true : false;
      })[0];
    })
    .catch((err) => {
      throw Error(err.message);
    });
}

async function createCard(title, content) {
  await getClient().post("/cards/extended", {
    collection: { id: collectionId },
    preferredPhrase: title,
    content: content,
    shareStatus: "TEAM",
    folderIds: [folderId],
  });
}

async function updateCard(cardId, title, content) {
  await getClient()
    .put("/cards/" + cardId + "/extended", {
      preferredPhrase: title,
      content: content,
    })
    .then(() => core.info("Card (" + cardId + ") updated successfully"))
    .catch((e) => {
      core.error(e.message);
      throw Error("Something went wrong, good luck.");
    });
}

function formatMarkdownForGuru(markdown) {
  return `<div class="ghq-card-content__markdown" data-ghq-card-content-type="MARKDOWN" data-ghq-card-content-markdown-content="${encodeURIComponent(
    markdown
  )}">${markdownParser.render(markdown)}</div>`;
}

function parseGuruMarkdown(content) {
  const guruMarkdown = content.match(
    /data-ghq-card-content-markdown-content=\".{1,}?\">/g
  );
  if (!guruMarkdown) {
    throw Error("Card contains no markdown");
  }
  const parsedMarkdown = decodeURIComponent(
    guruMarkdown[0].substring(40, guruMarkdown[0].length - 2)
  );
  return parsedMarkdown;
}

function markdownChanged(github, guru) {
  return SHA256(github).toString() !== SHA256(guru).toString();
}

async function run() {
  const cardTitle = repo + " README";
  let card = await getCards(cardTitle);

  const cardId = card?.id;

  if (cardId) {
    const guruMarkdown = parseGuruMarkdown(card.content);
    if (!markdownChanged(readme, guruMarkdown)) {
      return;
    }
    updateCard(cardId, cardTitle, formatMarkdownForGuru(readme));
  } else {
    createCard(cardTitle, formatMarkdownForGuru(readme));
  }
}

run();
