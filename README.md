# ShopEase E-Commerce + AI Chatbot

A realistic e-commerce demo built with HTML, CSS, JavaScript, Node.js, Express and SQLite3.

## Features
- Customer registration, login and logout
- Seller login and product management
- Product categories, search and sorting
- Cart and checkout demo
- Wishlist with live count and red heart state
- Order history
- SQLite database
- AI shopping assistant powered by OpenAI Responses API

## Run locally

1. Open PowerShell in this folder.
2. Install packages:

```powershell
npm install
```

3. Create the environment file:

```powershell
Copy-Item .env.example .env
```

4. Open `.env` and replace `your_api_key_here` with your OpenAI API key.

5. Start the website:

```powershell
node server.js
```

6. Open:

`http://localhost:3000`

## AI chatbot setup

The API key is used only by `server.js`. It is never placed in `public/app.js` or sent to the browser.

`.env` example:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.6-luna
SESSION_SECRET=change-this-to-a-random-secret
```

If `OPENAI_API_KEY` is missing, the rest of the store still starts, but the chatbot displays a configuration message.

## Demo accounts

Seller:
- Email: `seller@shopease.com`
- Password: `seller123`

Customer:
- Email: `user@shopease.com`
- Password: `user123`

## Important

Do not commit `.env` to GitHub. `.gitignore` already excludes it.
