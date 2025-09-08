Here’s a professional README.md you can use for your full URL Shortener project (frontend + backend):

# URL Shortener Application

A full-stack URL Shortener application built with **Node.js, Express, MongoDB** (backend) and **React.js with Material-UI** (frontend). Users can shorten long URLs, set expiry times, optionally create custom shortcodes, and view click statistics.

---

## Table of Contents

- [Features](#features)  
- [Tech Stack](#tech-stack)  
- [Project Structure](#project-structure)  
- [Installation](#installation)  
- [Running the Application](#running-the-application)  
- [Usage](#usage)  
- [Screenshots](#screenshots)  
- [License](#license)  

---

## Features

- Shorten long URLs with custom shortcodes (optional).  
- Set expiry time for URLs.  
- Track total clicks and detailed click statistics (IP, timestamp, user agent).  
- React frontend with Material-UI for a modern and responsive interface.  
- Navigation between **Shortener** and **Statistics** pages.  

---

## Tech Stack

**Frontend:**  
- React.js  
- React Router DOM  
- Axios  
- Material-UI (MUI)

**Backend:**  
- Node.js  
- Express.js  
- MongoDB (or any database of your choice)  
- Mongoose  

---

## Project Structure



url-shortener-backend/
├─ server.js
├─ models/
├─ routes/
└─ package.json

url-shortener-frontend/
├─ src/
│ ├─ components/
│ │ ├─ ShortenerForm.js
│ │ └─ StatisticsView.js
│ ├─ services/
│ │ └─ api.js
│ ├─ App.js
│ ├─ App.css
│ └─ index.js
├─ package.json
└─ public/


---

## Installation

### Backend

```bash
cd url-shortener-backend
npm install


Make sure you have MongoDB running and configured in your backend.

Frontend
cd url-shortener-frontend
npm install


This installs React, Material-UI, Axios, and React Router DOM.

Running the Application
Start Backend
cd url-shortener-backend
npm start


Backend runs on http://localhost:4000.

Start Frontend
cd url-shortener-frontend
npm start


Frontend runs on http://localhost:3000.
