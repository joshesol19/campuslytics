import os
import sys
import json
from urllib.parse import urlparse
from datetime import datetime

import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv

import matplotlib.pyplot as plt
import seaborn as sns


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def make_engine():
    if DATABASE_URL:
        return create_engine(DATABASE_URL, pool_pre_ping=True)

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


account_id = int(sys.argv[1])
month_key = sys.argv[2]  # "YYYY-MM"

year, month = map(int, month_key.split("-"))
start_date = datetime(year, month, 1)
end_date = datetime(year + (month // 12), (month % 12) + 1, 1)

# Pull withdrawals for this account + month
query = """
    SELECT *
    FROM withdrawals
    WHERE "accountID" = %(account_id)s
      AND "withdrawalDate" >= %(start)s
      AND "withdrawalDate" < %(end)s
"""
df_with = pd.read_sql(
    query,
    con=engine,
    params={"account_id": account_id, "start": start_date, "end": end_date},
)

base_dir = os.path.dirname(__file__)
graphs_dir = os.path.join(base_dir, "..", "images", "graphs")
os.makedirs(graphs_dir, exist_ok=True)

# Graph 1: this month's total per category
if df_with.empty:
    cat_month = pd.DataFrame({"category": [], "total_spend": []})
else:
    cat_month = (
        df_with.groupby("category", as_index=False)
        .agg(total_spend=("cost", "sum"))
        .sort_values("total_spend", ascending=False)
    )

plt.figure(figsize=(12, 6))
ax = sns.barplot(
    x="category",
    y="total_spend",
    data=cat_month,
    color="orange",
    errorbar=None,
)
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
plt.title(f"Total Dollars Spent by Category ({month_key})")
plt.xlabel("Category")
plt.ylabel("Dollars Spent ($)")
plt.xticks(rotation=45, ha="right")
plt.tight_layout()
out1 = os.path.join(graphs_dir, f"monthlyCategorySpending_{month_key}_account{account_id}.png")
plt.savefig(out1, dpi=300, bbox_inches="tight")
plt.clf()

# Graph 2: average dollars spent per category per month (common categories only)
query_avg_cat_per_month = f"""
    SELECT
      "category",
      AVG("month_total") AS avg_per_month,
      COUNT(DISTINCT period_month) AS month_count
    FROM (
      SELECT
        "category",
        DATE_TRUNC('month', "withdrawalDate") AS period_month,
        SUM("cost") AS month_total
      FROM withdrawals
      WHERE "accountID" = {account_id}
      GROUP BY period_month, "category"
    ) t
    GROUP BY "category"
    HAVING COUNT(DISTINCT period_month) >= 2
"""
df_avg_cat = pd.read_sql(query_avg_cat_per_month, con=engine)
if df_avg_cat.empty:
    df_avg_cat = pd.DataFrame({"category": [], "avg_per_month": []})
else:
    df_avg_cat = df_avg_cat.sort_values(by="avg_per_month", ascending=False)

plt.figure(figsize=(12, 6))
ax = sns.barplot(
    x="category",
    y="avg_per_month",
    data=df_avg_cat,
    color="orange",
    errorbar=None,
)
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
plt.title("Average Dollars Spent per Category (Per Month)")
plt.xlabel("Category")
plt.ylabel("Avg Dollars Spent / Month ($)")
plt.xticks(rotation=45, ha="right")
plt.tight_layout()
out2 = os.path.join(graphs_dir, f"monthlyAllCategoriesAccount{account_id}.png")
plt.savefig(out2, dpi=300, bbox_inches="tight")
plt.clf()

print(json.dumps({"ok": True}, default=str))
sys.stdout.flush()

