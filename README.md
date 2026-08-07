# 🔔 Jobs Alert Bot

> A Telegram bot that automatically finds job vacancies, exam prep content, and current affairs, then posts them to a student-focused channel — with AI doing the writing and a human approving before it goes live.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logo=groq&logoColor=white)

**🔗 Live channel:** [@AlertForJobBot](https://t.me/AlertForJobBot)

---

## ✨ What it does

Built for students — job alerts, quizzes, and exam prep, kept fresh automatically.

| Feature | Details |
|---|---|
| **Job alerts** | Pulls fresh vacancies via SerpAPI, summarizes with AI |
| **MCQ quizzes** | Auto-generated current affairs and exam-prep quizzes |
| **Preview before posting** | Nothing goes live without a manual approval step |
| **Memory** | Remembers past conversations/posts via Supabase, avoids repeats |

## 🛠️ How it's built

- **Bot logic** — Node.js + TypeScript, deployed on Render
- **Content generation** — Groq (`llama-3.3-70b-versatile`) writes and summarizes job/quiz content
- **Search** — SerpAPI fetches current job postings
- **Images** — Pixabay for supporting visuals
- **Database** — Supabase stores conversation memory and post history

## 📁 Project structure

```
.
├── src/                 # bot source code
├── .env.example          # environment variable template
├── package.json
└── render.yaml           # deployment config
```

## 🚀 Run it locally

```
git clone https://github.com/mahakGoyat/jobs-alert-bot.git
cd jobs-alert-bot
npm install
```

Copy `.env.example` to `.env`, fill in your own API keys, then:

```
npm run dev
```

## 📄 License

Built by [Mahak Goyat](https://github.com/mahakGoyat)
