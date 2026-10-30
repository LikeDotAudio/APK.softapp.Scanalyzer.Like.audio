"""Print the `peaks` table layout of the Scanalyzer cloud database.

Credentials come from the environment (the same SCAN_DB_* names the PHP API reads);
none are kept in this repository.

    SCAN_DB_HOST=scanalyzer.like.audio SCAN_DB_USER=... SCAN_DB_PASS=... \\
    SCAN_DB_NAME=... python3 Web_Front/tools/api/describe_db.py
"""
import os
import sys

import mysql.connector

missing = [k for k in ("SCAN_DB_USER", "SCAN_DB_PASS", "SCAN_DB_NAME") if not os.environ.get(k)]
if missing:
    sys.exit("describe_db.py: set " + ", ".join(missing) + " (credentials are not kept in the repo)")

db = mysql.connector.connect(
    host=os.environ.get("SCAN_DB_HOST", "scanalyzer.like.audio"),
    user=os.environ["SCAN_DB_USER"],
    password=os.environ["SCAN_DB_PASS"],
    database=os.environ["SCAN_DB_NAME"],
)
cursor = db.cursor()
cursor.execute("DESCRIBE peaks")
for row in cursor.fetchall():
    print(row)
