# Jobs Alert Bot

A Telegram bot that finds job vacancies, creates exam-prep quizzes and current affairs content, and posts them to a channel for students. AI writes the drafts, and you approve every post before it goes live.

**Try it on Telegram:** [@AlertForJobBot](https://t.me/AlertForJobBot)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)

---

## Features

- **Job alerts:** fetches current vacancies with SerpAPI and summarizes them with AI
- **MCQ quizzes:** generates exam-prep and current affairs quizzes automatically
- **Preview and approve:** every post is shown to you first and is published only after you approve it
- **Conversation memory:** past conversations and posts are saved in Supabase, so content does not repeat
- **Images:** adds relevant images to posts using Pixabay

## Tech Stack

- **Language:** TypeScript on Node.js
- **Bot:** node-telegram-bot-api, Express
- **AI:** Groq (`llama-3.3-70b-versatile`)
- **Job search:** SerpAPI
- **Images:** Pixabay
- **Database:** Supabase
- **Hosting:** Render

## Project Structure

```
.
├── src/             # Bot source code
├── .env.example     # Environment variable template
├── package.json
└── tsconfig.json
```

## Run Locally

### Prerequisites

- Node.js
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- API keys for Groq, SerpAPI, Pixabay and a Supabase project

### Setup

```bash
git clone https://github.com/mahakGoyat/jobs-alert-bot.git
cd jobs-alert-bot
npm install
```

Copy `.env.example` to `.env` and fill in your own values (see below), then start the bot:

```bash
npx tsx src/index.ts
```

## Environment Variables

| Variable | Used for |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `GROQ_API_KEY` | AI content generation |
| `SERPAPI_KEY` | Searching for job vacancies |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `PIXABAY_API_KEY` | Post images |

Never commit your `.env` file or share your keys.

## Author

Built by [Mahak Goyat](https://github.com/mahakGoyat).
