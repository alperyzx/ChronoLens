# **App Name**: ChronoLens

## Core Features:

- Historical Event Retrieval: Fetch historical events from the Gemini API based on the selected date or week and category-specific prompts. Use the API as a tool to retrieve relevant historical data.
- Event Categorization: Categorize fetched events into Sociology, Technology, Philosophy, Science, Politics, and Art.
- Event Validation: Validate event data to ensure each event has a title, a valid ISO date (before the current year), a description (50–100 words), and a matching category. Filter out invalid or current-year events.
- Event Display: Display historical events in collapsible cards, grouped by category, showing the title, date, and description. Apply CSS fade-in animations for card expansion.
- View Toggle: Include a toggle switch for "Today" (historical events for the current date in past years) vs. "This Week" (historical events for the current ISO week in past years) views. Persist the toggle state in localStorage.
- Night Mode: Implement a night mode feature that switches on and off based on the user's system default settings.
- RSS Feed Subscription: Add an RSS feed icon at the top right to allow visitors to subscribe for updates.

## Style Guidelines:

- Primary color: Neutral white or light grey for the background to provide a clean and readable surface.
- Secondary color: Dark grey or black for text to ensure high contrast and readability.
- Accent: Teal (#008080) for interactive elements like the toggle switch, links, and headings to draw attention and create a focal point.
- Clean and readable sans-serif fonts for the main content to ensure readability across different devices.
- Simple and consistent icons for categories and interactive elements to enhance usability and visual appeal.
- Use a card-based layout for displaying historical events, ensuring a clear and organized presentation.
- Subtle fade-in animations for card expansions to create a smooth and engaging user experience.
- Sociology: Interconnected human figures (three stick figures with connecting lines).
- Technology: Circuit board pattern (zigzag lines).
- Philosophy: Quill and scroll (quill over a scroll outline).
- Science: Atom (three elliptical orbits).
- Politics: Gavel (hammer shape).
- Art: Paintbrush (diagonal brush stroke).
- Night Mode: Dark background with light text for better readability in low-light conditions, activated based on user system preferences.
- RSS Feed: Place the RSS feed icon at the top right corner of the page for easy access.
- RSS Feed: Use a standard RSS feed icon.

## Original User Request:
Today in History Project Specification
Project Overview
"Today in History" is a web application that displays historical events from past years for the current day or ISO week, categorized into Sociology, Technology, Philosophy, Science, Politics, and Art. Events are sourced from the Gemini API and represent significant moments from history, not current-day or current-week occurrences. The app uses Firebase for hosting, authentication, and caching. Each category features a unique SVG background embedded in CSS. A toggle switch allows switching between "Today" (historical events for the current date in past years) and "This Week" (historical events for the current ISO week in past years) views, with caching to optimize API usage. Events are validated to ensure they are historical and match the selected period.
Functional Requirements
Event Retrieval and Categorization

Gemini API Integration:
Fetch historical events for:
"Today" view: Events that occurred on the current date (e.g., April 19th) in past years (before 2025).
"This Week" view: Events that occurred during the current ISO week (Monday–Sunday, e.g., week containing April 19th) in past years.


Retrieve 5–7 events per category: Sociology, Technology, Philosophy, Science, Politics, Art.
Use category-specific prompts to ensure relevant, high-quality historical data. Updated prompts:
Sociology: "As a sociologist, provide significant historical events from past years related to societal changes, cultural shifts, or social movements that occurred on [date/week]. Exclude events from the current year."
Technology: "As a technologist, list key historical technological inventions or milestones from past years for [date/week]. Exclude events from the current year."
Philosophy: "As a philosopher, share notable historical philosophical ideas or thinkers’ milestones from past years for [date/week]. Exclude events from the current year."
Science: "As a scientist, provide major historical scientific discoveries or breakthroughs from past years for [date/week]. Exclude events from the current year."
Politics: "As a political scientist, list significant historical political events or treaties from past years for [date/week]. Exclude events from the current year."
Art: "As an art historian, highlight important historical artistic movements or works from past years for [date/week]. Exclude events from the current year."


Event data format: JSON with title (string), date (ISO date string, e.g., 1995-04-19), description (50–100 words), category (string).
Response Validation:
Ensure each event has:
title: Non-empty string.
date: Valid ISO date string (before the current year, e.g., < 2025).
description: String, 50–100 words.
category: Matches one of the defined categories.


Filter events to include only:
"Today" view: Events where the month and day match the current date (e.g., MM-DD matches 04-19).
"This Week" view: Events within the current ISO week in past years.


Discard invalid or current-year events; log errors for debugging.


Error Handling: Fallback to cached data if API response is invalid or empty; display user-friendly error messages.



User Interface

Home Screen:
Display historical events for the current date by default, grouped by category.
Include a toggle switch (top-right) for "Today" vs. "This Week" views.
Use Tailwind CSS for responsive styling.


Event Display:
Show events in collapsible cards per category, displaying title, date, and description.
Apply CSS fade-in animations for card expansion.


Accessibility:
Ensure high-contrast text over SVG backgrounds (WCAG 2.1 AA).
Add ARIA labels for toggle switch and cards.



SVG Backgrounds

Embed unique SVG images in CSS for each category, optimized for performance.
Category-Specific SVGs:
Sociology: Interconnected human figures (three stick figures with connecting lines).
Technology: Circuit board pattern (zigzag lines).
Philosophy: Quill and scroll (quill over a scroll outline).
Science: Atom (three elliptical orbits).
Politics: Gavel (hammer shape).
Art: Paintbrush (diagonal brush stroke).


Ensure SVGs are responsive (background-size: cover) and provide contrast for text.

Caching and Performance

Firebase Firestore Caching:
Cache validated historical events in events/{date}/{category} (daily) or events/week/{weekNumber}/{category} (weekly).
Store week metadata (startDate, endDate).
Cache expiration: 24 hours (daily), 7 days (weekly).


Client-Side Caching:
Use localStorage for validated historical events with timestamp and week range.
Validate cached events’ dates to ensure they are historical and match the period.


Rate Limiting:
Apply exponential backoff for API retries.
Show "Please try again later" on rate limit errors.



Toggle Switch

Default: "Today" (historical events for the current date in past years).
Alternate: "This Week" (historical events for the current ISO week in past years).
Update UI with validated events; use cached data if available.
Persist toggle state in localStorage.

Gemini API Integration

Store API keys in Firebase environment variables.
API request: Include date or week, category, prompt (emphasizing historical events).
Response: JSON with title, date, description, category.
Validate and filter responses to exclude current-year events before caching/displaying.
Sanitize responses to prevent XSS.

Non-Functional Requirements

Performance: Page load < 2s (cached), < 5s (API-fetched).
Scalability: Support 10,000 daily users on Firebase free tier.
Security: Use HTTPS; sanitize inputs/outputs.
Compatibility: Support latest Chrome, Firefox, Safari, Edge.
Responsiveness: Optimize for 320px–1920px screens.

Future Enhancements

Add authentication for saving favorite historical events.
Implement search by keyword or historical date.
Enable sharing on social media (e.g., X.com).
Add a timeline view for historical events.

Sample Code Structure
Below is a React application with SVG backgrounds and a focus on historical events.


  