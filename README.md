# ChronoLens

ChronoLens is a web application for discovering significant historical events across a wide range of subjects, including Sociology, Technology, Philosophy, Science, Politics, Art, Sports, and Literature. It uses Gemini for event generation, MongoDB for durable persistence, and layered client/server caching to keep repeat views fast. The backend is deployed through Firebase on Google Cloud infrastructure.

## Features
- Browse and search historical events by date and subject
- Modern, responsive UI built with Next.js and Tailwind CSS
- AI-powered event summaries and highlights
- Admin interface for cache management, report recovery, and enhanced statistics
- Client-side cache with backend revision checks to avoid needless refreshes
- Open Graph and SEO optimized

## Getting Started
1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Run the development server:**
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure
- `src/app/` — Main application pages and layout
- `src/components/` — Reusable UI components
- `src/lib/` — Utility and cache logic
- `src/services/` — Data fetching and integrations
- `src/ai/` — AI and event summarization flows

## Contributing
Pull requests and suggestions are welcome! Please open an issue to discuss any major changes.

## License
MIT
