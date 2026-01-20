# CampusLytics

CampusLytics is a full-stack personal finance analytics web application built with **Node.js (Express + EJS)** and **PostgreSQL**, with optional **Python-based analysis and visualizations** triggered by user interaction.

The app allows users to track deposits and withdrawals by pay period, view running balances, and generate analytical insights and charts on demand.

---

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** EJS templates
- **Database:** PostgreSQL (via Knex)
- **Analysis:** Python (charts + optional AI recommendations)
- **Auth:** Session-based authentication
- **Deployment-ready:** Docker compatible

---

## Features

- User authentication (session-based)
- Deposit & withdrawal tracking
- Pay-period level balance calculations
- On-demand financial analysis via Python
- Graph generation for spending insights
- Optional AI-generated recommendations

---

## Database Setup

1. Create a PostgreSQL database
2. Run the schema file:

```bash
psql -d campuslytics -f db/schema.sql
```

(Optional) Seed sample data:

```bash
psql -d campuslytics -f db/seed.sql
```

---

## Getting Started (Local Setup)

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/campuslytics.git
cd campuslytics

