# CampusLytics

CampusLytics is a full-stack personal finance analytics web application built with **Node.js (Express + EJS)** and **PostgreSQL**, with optional **Python-based analysis and visualizations** triggered by user interaction.

The app allows users to track deposits and withdrawals by pay period, view running balances, and generate analytical insights and charts on demand.

---

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** EJS templates
- **Database:** PostgreSQL (via Knex)
- **Analysis:** Python (charts + optional AI recommendations)
- **Authentication:** Session-based authentication
- **Deployment:** Docker-compatible

---

## Features

- User authentication (session-based)
- Deposit and withdrawal tracking
- Pay-period level balance calculations
- On-demand financial analysis via Python
- Graph generation for spending insights
- Optional AI-generated recommendations

---

## Getting Started (Local Setup)

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/campuslytics.git
cd campuslytics
````

### 2. Install Node dependencies

```bash
npm install
```

---

## Database Setup

1. Create a PostgreSQL database locally.
2. Run the schema file:

```bash
psql -d campuslytics -f db/schema.sql
```

(Optional) Seed sample data:

```bash
psql -d campuslytics -f db/seed.sql
```

---

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
PORT=3000
SESSION_SECRET=your_session_secret

DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=

GROQ_API_KEY=
```

### Notes

* **`.env` is required** to run the app locally.
* Do **not** commit `.env` to GitHub.
* `GROQ_API_KEY` is only required if using AI analysis routes.

More information on obtaining a GROQ API key:
[https://console.groq.com/keys](https://console.groq.com/keys)

---

## Python Analysis

Python scripts are executed **only when a user explicitly requests analysis** from the UI.

The Node server spawns Python processes at runtime to:

* generate spending graphs
* compute analytical summaries
* optionally return AI-generated recommendations

Make sure:

* `python3` is available on your system
* required Python packages are installed

Python dependencies are listed in `requirements.txt`.

---

## Running the Application

```bash
npm start
```

Then visit:

```
http://localhost:3000
```

---

## Deployment Notes

* Designed to run on platforms such as **Render** with **Neon PostgreSQL**
* Supports Docker-based deployment
* Environment variables must be configured on the hosting platform
* Free hosting platforms may introduce cold-start delays

---

## Disclaimer

CampusLytics is an educational and portfolio project.
It is not a financial product and does not provide financial advice.

---

## Author

Joshua Solano

````
