import os
import json
import sys
from urllib.parse import urlparse

import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv

import matplotlib.pyplot as plt
import seaborn as sns

from openai import OpenAI


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")


def make_engine():
    """
    Create a SQLAlchemy engine either from DATABASE_URL or from individual
    DB_* environment variables. Kept lightweight because this runs on every
    analysis request.
    """
    if DATABASE_URL:
        # Single, already-parsed URL from the environment
        return create_engine(DATABASE_URL, pool_pre_ping=True)

    # Fallback to local connection settings
    db_user = os.getenv("DB_USER")
    db_password = os.getenv("DB_PASSWORD")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME")

    if not db_user or not db_name or not db_password:
        raise RuntimeError("Missing DB_USER, DB_NAME or DB_PASSWORD for local connection")

    dsn = f"postgresql+psycopg2://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    return create_engine(dsn, pool_pre_ping=True)


engine = make_engine()


client = None
if GROQ_API_KEY:
    # Lazily create the Groq/OpenAI client only when we have a key
    client = OpenAI(
        api_key=GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1",
    )


# 3. grab args
deposit_id = int(sys.argv[1])  # from Node
mode = sys.argv[3] if len(sys.argv) > 3 else "ai"
UserAccountID = int(sys.argv[2])


# 5. Pull withdrawals for this deposit into a DataFrame
queryWith = f'SELECT * FROM withdrawals WHERE "depositID" = {deposit_id};'
dfWith = pd.read_sql(queryWith, con=engine)

queryDeposit = f'SELECT * FROM deposits WHERE "depositID" = {deposit_id};'
dfDeposit = pd.read_sql(queryDeposit, con=engine)
#############################################
#############################################

# 6. Aggregate data / safety against empty periods
row_count = int(len(dfWith))
total_cost = float(dfWith["cost"].sum()) if not dfWith.empty else 0.0

# get average prices across all history for this account
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
if not df_averages.empty:
    df_averages["baseline_eligible"] = df_averages["deposit_count"] >= 2
else:
    df_averages["baseline_eligible"] = []

# 1) Category totals (whole context) – guard if no withdrawals this period
if dfWith.empty:
    cat_totals = pd.DataFrame(columns=["category", "total_spend", "tx_count"])
    top_tx = pd.DataFrame(
        columns=["withdrawalID", "withdrawalDate", "category", "subcategory", "location", "cost", "notes", "onlineFlag"]
    )
    outliers = pd.DataFrame(columns=["withdrawalID", "withdrawalDate", "category", "cost", "location", "notes"])
else:
    cat_totals = (
        dfWith.groupby("category", as_index=False)
        .agg(total_spend=("cost", "sum"), tx_count=("cost", "size"))
        .sort_values("total_spend", ascending=False)
    )

    # 2) Top 25 individual transactions (details that matter)
    top_tx = (
        dfWith.sort_values("cost", ascending=False)
        .head(25)[
            [
                "withdrawalID",
                "withdrawalDate",
                "category",
                "subcategory",
                "location",
                "cost",
                "notes",
                "onlineFlag",
            ]
        ]
    )

    # 3) Outliers (optional, but strong context)
    if dfWith["cost"].count() >= 4:
        q1, q3 = dfWith["cost"].quantile([0.25, 0.75])
        iqr = q3 - q1
        cutoff = q3 + 1.5 * iqr
        outliers = (
            dfWith[dfWith["cost"] > cutoff]
            .sort_values("cost", ascending=False)
            .head(20)[["withdrawalID", "withdrawalDate", "category", "cost", "location", "notes"]]
        )
    else:
        outliers = pd.DataFrame(columns=["withdrawalID", "withdrawalDate", "category", "cost", "location", "notes"])

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

    # Graph 1: total spent per category for THIS deposit period
    if dfWith.empty:
        period_cat = pd.DataFrame({"category": [], "total_spend": []})
    else:
        period_cat = (
            dfWith.groupby("category", as_index=False)
            .agg(total_spend=("cost", "sum"))
            .sort_values("total_spend", ascending=False)
        )

    plt.figure(figsize=(12, 6))

    ax = sns.barplot(
        x="category",
        y="total_spend",
        data=period_cat,
        color="orange",
        errorbar=None,
    )

    # add data labels on top of each bar
    for bar in ax.patches:
        height = bar.get_height()
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            height,
            f"${height:,.2f}",
            ha='center',
            va='bottom',
            fontsize=9
        )

    plt.title('Total Dollars Spent by Category (This Period)')
    plt.xlabel("Category")
    plt.ylabel("Dollars Spent ($)")
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()

    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.clf()



    # Graph 2: average spending per category PER payment/deposit period (overall)
    # Compute: for each depositID+category, sum(cost); then average those sums per category.
    query_avg_cat_per_period = f'''
        SELECT
          "category",
          AVG("period_total") AS avg_per_period,
          COUNT(DISTINCT "depositID") AS deposit_count
        FROM (
          SELECT
            "category",
            "depositID",
            SUM("cost") AS period_total
          FROM withdrawals
          WHERE "accountID" = {UserAccountID}
          GROUP BY "depositID", "category"
        ) t
        GROUP BY "category"
        HAVING COUNT(DISTINCT "depositID") >= 2
    '''
    df_avg_cat = pd.read_sql(query_avg_cat_per_period, con=engine)
    if df_avg_cat.empty:
        df_avg_cat = pd.DataFrame({"category": [], "avg_per_period": []})
    else:
        df_avg_cat = df_avg_cat.sort_values(by="avg_per_period", ascending=False)

    plt.figure(figsize=(12, 6))
    ax = sns.barplot(
        x="category",
        y="avg_per_period",
        data=df_avg_cat,
        color="orange",
        errorbar=None,
    )

    # add data labels
    for bar in ax.patches:
        height = bar.get_height()
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            height,
            f"${height:,.2f}",
            ha="center",
            va="bottom",
            fontsize=9,
        )

    plt.title("Average Dollars Spent per Category (Per Payment Period)")
    plt.xlabel("Category")
    plt.ylabel("Avg Dollars Spent / Period ($)")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()

    output_path = os.path.join(output_dir, f"allCategoriesCostsAccount{UserAccountID}.png")
    plt.savefig(output_path, dpi=300, bbox_inches="tight")
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
    9) Make sure that any bullet points are formatted with a new line after each point. (use <br> tags)
    
    
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
      - Output a table wrapped EXACTLY like this so it works on mobile:

      <div class="table-responsive">
        <table class="table table-sm table-bordered align-middle mb-0">
          ...
        </table>
      </div>

      - Table columns must be exactly: Category, Total Spent, % of Total, Transactions, Avg per Transaction
      - Sort by Transactions desc. Show up to 7 categories.
      - IMPORTANT: Use short header labels to reduce width:
        Category | Total | % | Tx | Avg/Tx
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

fallback_html = """
<div>
  <h2>Analysis temporarily unavailable</h2>
  <p>We were unable to generate AI analysis for this period. You can still use the graphs above to review your spending by category.</p>
</div>
"""

ai_html = fallback_html

if client is None:
    # No API key configured – return a graceful fallback instead of crashing
    print(json.dumps({"AI_Recomendation": ai_html}, default=str))
    sys.stdout.flush()
    sys.exit(0)

def _escape_html(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _normalize_ai_html(content: str, fallback: str) -> str:
    """
    Models sometimes return markdown-style bullets (e.g. "* item") or plain text.
    Browsers collapse raw newlines, so we convert common bullet patterns to
    real HTML (<ul><li>...</li></ul>) and always return a single <div> wrapper.
    """
    if not content or not content.strip():
        return fallback

    trimmed = content.strip()

    # If it already looks like HTML, keep it; ensure we have a wrapper <div>.
    if "<" in trimmed and "</" in trimmed:
        if trimmed.lower().startswith("<div"):
            return trimmed
        return f"<div>{trimmed}</div>"

    # Plain text / markdown-ish: convert bullets + paragraphs.
    lines = trimmed.splitlines()
    out: list[str] = ["<div>"]
    in_list = False
    saw_bullets = False

    for raw in lines:
        line = raw.rstrip()
        stripped = line.lstrip()
        is_bullet = stripped.startswith("* ") or stripped.startswith("- ")

        if is_bullet:
            saw_bullets = True
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{_escape_html(stripped[2:].strip())}</li>")
            continue

        if in_list:
            out.append("</ul>")
            in_list = False

        if stripped == "":
            out.append("<br>")
        else:
            out.append(f"<p>{_escape_html(stripped)}</p>")

    if in_list:
        out.append("</ul>")

    out.append("</div>")

    if not saw_bullets:
        return f"<div><p>{_escape_html(trimmed)}</p></div>"

    return "\n".join(out)

try:
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1200,
    )
    content = resp.choices[0].message.content or ""
    ai_html = _normalize_ai_html(content, fallback_html)
except Exception as exc:
    # Print to stderr for Node to log, but still return a useful message to the user
    print(f"[analysis.py] AI call failed: {exc}", file=sys.stderr)

print(json.dumps({"AI_Recomendation": ai_html}, default=str))
sys.stdout.flush()
sys.exit(0)
