import os
import json
from openai import OpenAI

from dotenv import load_dotenv
import pandas as pd
from sqlalchemy import create_engine

import matplotlib.pyplot as plt
import seaborn as sns
import sys

# from google import genai

# 1. Load .env from current/parent dirs
load_dotenv()

# 2. Read environment variables
DB_USER = os.getenv("DB_USER", "joshuasolano")
DB_PASSWORD = os.getenv("DB_PASSWORD")  # no fallback; fail loudly if missing
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "financeProject")
API_KEY = os.getenv('API_KEY')
GROQ_API_KEY = os.getenv('GROQ_API_KEY')

client = OpenAI(
    api_key=GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)


# client = genai.Client(api_key=API_KEY)

# 3. grab args
deposit_id = int(sys.argv[1])  # from Node
mode = sys.argv[3] if len(sys.argv) > 3 else "ai"
UserAccountID = int(sys.argv[2])

# deposit_id = 8

# 4. Build connection string for Postgres with psycopg2
engine = create_engine(
    f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# 5. Pull withdrawals for this deposit into a DataFrame
queryWith = f'SELECT * FROM withdrawals WHERE "depositID" = {deposit_id};'
dfWith = pd.read_sql(queryWith, con=engine)

queryDeposit = f'SELECT * FROM deposits WHERE "depositID" = {deposit_id};'
dfDeposit = pd.read_sql(queryDeposit, con=engine)
#############################################
#############################################

# 6. Simple test values so we know everything works
row_count = int(len(dfWith))
total_cost = float(dfWith["cost"].sum()) if not dfWith.empty else 0.0

# get average prices
queryForAvgs = (f'''
                SELECT
                  "category",
                  COUNT(DISTINCT "depositID") AS deposit_count,
                  AVG("avgcost") AS avg
                FROM (
                  SELECT
                    "category",
                    "depositID",
                    AVG("cost") AS avgCost
                  FROM withdrawals
                  WHERE "accountID" = {UserAccountID}
                  GROUP BY "depositID", "category"
                ) t
                GROUP BY "category"
                    ''')
df_averages = pd.read_sql(queryForAvgs, con=engine)
df_averages["baseline_eligible"] = df_averages["deposit_count"] >= 2

# 1) Category totals (whole context)
cat_totals = (dfWith.groupby("category", as_index=False)
              .agg(total_spend=("cost", "sum"),
                   tx_count=("cost", "size"))
              .sort_values("total_spend", ascending=False))

# 2) Top 25 individual transactions (details that matter)
top_tx = (dfWith.sort_values("cost", ascending=False)
.head(25)[["withdrawalID", "withdrawalDate", "category", "subcategory", "location", "cost", "notes", "onlineFlag"]])

# 3) Outliers (optional, but strong context)
q1, q3 = dfWith["cost"].quantile([0.25, 0.75])
iqr = q3 - q1
cutoff = q3 + 1.5 * iqr
outliers = dfWith[dfWith["cost"] > cutoff].sort_values("cost", ascending=False)
outliers = outliers.head(20)[["withdrawalID", "withdrawalDate", "category", "cost", "location", "notes"]]

payload = {
    "period_deposit": dfDeposit.to_dict(orient="records"),
    "category_summary": cat_totals.to_dict(orient="records"),
    "top_transactions": top_tx.to_dict(orient="records"),
    "outliers": outliers.to_dict(orient="records"),
    "overall_category_averages": df_averages.to_dict(orient="records"),
}


# FAST MODE: return payload + basic stats, NO AI call
if mode == "fast":
    # Build path relative to this script file
    base_dir = os.path.dirname(__file__)  # .../Finance Project/python
    output_dir = os.path.join(base_dir, '..', 'images', 'graphs')
    os.makedirs(output_dir, exist_ok=True)

    output_path = os.path.join(output_dir, f"categorySpending{deposit_id}.png")

    # build the graph for the dollars spent in THIS withdrawal peroid
    # Sort values highest → lowest
    dfWith = dfWith.sort_values(by='cost', ascending=False)
    plt.figure(figsize=(12, 6))
    sns.barplot(x='category', y='cost', data=dfWith, color='orange', errorbar=None)
    plt.title('Dollars Spent by Category (This Period)')
    plt.xlabel("Category")
    plt.ylabel("Dollars Spent ($)")
    # Make labels readable
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.clf()


    # allCategoriesCosts graph
    # Sort values highest → lowest
    df_averages = df_averages.sort_values(by='avg', ascending=False)
    # Make the plot
    plt.figure(figsize=(12, 6))  # wider figure helps with long labels
    sns.barplot(x='category', y='avg', data=df_averages[df_averages["baseline_eligible"]], color='orange', errorbar=None)
    plt.title('Average Dollars Spent by Category (Overall)')
    plt.xlabel("Category")
    plt.ylabel("Dollars Spent ($)")
    plt.xticks(rotation=45, ha='right')  # angled readable labels
    plt.tight_layout()
    output_path = os.path.join(output_dir, f"allCategoriesCostsAccount{UserAccountID}.png")
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.clf()

    result = {
        "row_count": int(len(dfWith)),
        "total_cost": float(dfWith["cost"].sum()) if not dfWith.empty else 0.0,
        "payload": payload
    }
    print(json.dumps(result, default=str))
    sys.stdout.flush()
    sys.exit(0)




# AI MODE: call AI and return only the AI html (or also include basics if you want)
payload_json = json.dumps(payload, default=str)


prompt = f"""
   You are a financial coach for a nontechnical audience.
    
    You will be given JSON with:
    - period_deposit[0]: depositID, depositDate, depositAmount, hoursWorked, start_Balance
    - category_summary: category, total_spend, tx_count (for THIS period only)
    - top_transactions: list of transactions (THIS period)
    - outliers: transactions flagged as outliers (THIS period)
    - overall_category_averages: category, avg, deposit_count, baseline_eligible
    
    Hard rules:
    1) Output ONLY valid HTML inside a single <div>. No markdown. No backticks.
    2) Use the exact section order and headings below EVERY time (consistency matters).
    3) Do not invent numbers. Use only values from JSON and the math rules I give you.
    4) All dollar amounts: 2 decimals. Percentages: 0 or 1 decimal.
    5) If a section has no data (empty list), write “None this period.” and continue.
    6) If tithing is included, still consider it in the calculations of course, but don't mention it for recommendations
        or listing outliers or top spends, etc.
    7) Only compare a category to “your usual” if overall_category_averages.baseline_eligible is true (deposit_count >= 2).
    8) If a category is NOT baseline_eligible, treat it as “one-time/irregular” and DO NOT label it Above/Below/On average.

    
    Math rules:
    - start_balance_calc = start_Balance + depositAmount
    - total_spent_calc = sum(category_summary.total_spend)  (if empty, 0)
    - end_balance_calc = start_balance_calc - total_spent_calc
    - net_gain_loss = depositAmount - total_spent_calc
    - spend_rate = total_spent_calc / depositAmount   (if depositAmount is 0, show “N/A”)
    
    Required HTML template (use these exact headings):
    
    <div>
      <h2>Snapshot for Payment Period of (depositDate)</h2>
    
      <h3>1) Money Summary</h3>
      - Show: Starting Balance (calculated), Deposit Amount, Total Spent, Ending Balance (calculated), Net Gain/Loss, Spend Rate
    
      <h3>2) Where the Money Went</h3>
      - Table with columns: Category, Total Spent, % of Total, Transactions, Avg per Transaction
      - Don't show Tithing (if applicable)
      - Sort by Transactions desc. Show up to 7 categories.
      - Add <br> tag at the end
    
      <h3>3) Biggest Drivers</h3>
      - Bullet top 3 categories with: $ amount + % of total + 1 sentence why it matters.
    
      <h3>4) Compared to Your Usual</h3>
      - Compare THIS period’s Total Spent in the category to overall_category_averages[category].avg
      - Only include categories where baseline_eligible = true.
      - If none of the top 3 categories are baseline_eligible, write: “Not enough history yet to compare recurring categories.”
      - Never compare irregular categories here.
      - Don't include tithing if applicable

    
      <h3>5) Notable Transactions</h3>
      - List up to 5 from top_transactions (largest costs), formatted:
        “(date): (category) – (subcategory/company) – $(cost) (location)”
      - Don't include tithing if applicable
    
      <h3>6) Outliers to Review</h3>
      - List outliers (up to 3). For each, include a “Check:” suggestion (bulk buy? mistake? subscription? one-time?)
    
      IF APPLICABLE:
      <h3>6.5) One-Time / Irregular Spending</h3>
      - Identify any categories from category_summary that are baseline_eligible = false (or missing from averages).
      - List up to 3 with: Category, Total Spent, and a “Reflect:” question.
      - Do not shame; just make it a decision checkpoint.
      - If this does not apply, skip this section
    
      <h3>7) Action Plan for Next Period</h3>
      - Provide exactly 3 action bullets, each with a specific $ target or limit.
      - Provide 1 “If you do only one thing:” line.
    
      <h3>8) One Habit to Try</h3>
      - One short sentence of a specific habit suggestion 
        (If saved money, say they did good but to do even better do ___. ).
      
      <h3>9) Summary</h3>
      - Short conclusion (3-4 sentences)
      - If they saved, talk about WHY they saved so they know what to continue doing
    
    DATA(JSON):
    {payload_json}

    """
resp = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[
        {"role": "user", "content": prompt}
    ],
    temperature=0.3,
)

ai_html = resp.choices[0].message.content or ""
print(json.dumps({"AI_Recomendation": ai_html}, default=str))
sys.stdout.flush()
sys.exit(0)