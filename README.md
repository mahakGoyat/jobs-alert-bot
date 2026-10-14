# Jobs Alert Bot

A Telegram quiz bot for exam preparation. Type what you want in plain language and the bot creates MCQ quizzes with AI and posts them to your Telegram channel as quiz polls.

**Try it on Telegram:** [@AlertForJobBot](https://t.me/AlertForJobBot)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)

---

## Features

- **Subject quizzes:** government-exam level MCQs on any subject you ask for (General Knowledge by default), up to 20 questions
- **Exam-pattern quizzes:** questions modeled on a named exam, with an optional subject filter, up to 15 questions
- **Current affairs quizzes:** questions built from the latest news headlines fetched with SerpAPI (Google News), up to 15 questions
- **Hindi and English:** quizzes in Hindi (default), English, or both, with the English translation shown in brackets
- **Natural language:** no slash commands, just type what you want
- **Conversation memory:** the last few days of chat are stored in Supabase, so the bot remembers context
- **Forget option:** ask the bot to clear its stored context

## How It Works

1. You send a message to the bot.
2. Groq AI works out what you want (subject quiz, exam-pattern quiz, current affairs, chat or forget).
3. The AI writes the questions, and the bot checks them.
4. Each valid question is posted to the channel as a Telegram quiz poll.
5. The bot tells you how many questions were posted.

## Tech Stack

- **Language:** TypeScript on Node.js
- **Bot:** node-telegram-bot-api, Express
- **AI:** Groq (`openai/gpt-oss-120b`)
- **News search:** SerpAPI
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
- A Telegram bot token from [@BotFather](https://t.me/BotFather) and a Telegram channel where the bot is an admin
- API keys for Groq and SerpAPI, and a Supabase project

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
| `TELEGRAM_CHANNEL_ID` | Channel where quizzes are posted |
| `GROQ_API_KEY` | AI quiz generation |
| `SERPAPI_KEY` | Current affairs news search |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `PORT` | Optional, defaults to 3000 |

Never commit your `.env` file or share your keys.

## Author

Built by [Mahak Goyat](https://github.com/mahakGoyat).
