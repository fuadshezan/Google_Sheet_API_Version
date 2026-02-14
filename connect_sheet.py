import sys
import gspread
from google.oauth2.service_account import Credentials
from google.auth.exceptions import DefaultCredentialsError
import pandas as pd

# Define scopes
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Step 1: Authenticate
print("=== Connection Test ===")
try:
    creds = Credentials.from_service_account_file("credentials.json", scopes=SCOPES)
except FileNotFoundError:
    print("FATAL: credentials.json not found. Place it in the same directory as this script.")
    sys.exit(1)
except (DefaultCredentialsError, ValueError) as e:
    print(f"FATAL: Invalid credentials.json: {e}")
    sys.exit(1)

try:
    client = gspread.authorize(creds)
except Exception as e:
    print(f"FATAL: Google Sheets authorization failed: {e}")
    sys.exit(1)

# Step 2: List all accessible spreadsheets
try:
    spreadsheets = client.openall()
    print(f"Credentials are working. Found {len(spreadsheets)} accessible spreadsheet(s):")
    for s in spreadsheets:
        print(f"  - {s.title} (ID: {s.id})")
except gspread.exceptions.APIError as e:
    print(f"ERROR: Could not list spreadsheets: {e}")
    sys.exit(1)

# Step 3: Open the spreadsheet and list all sheets (tabs)
print("\n=== Opening 'Aesthetico' Spreadsheet ===")
try:
    spreadsheet = client.open("Aesthetico")
    print(f"Spreadsheet opened: {spreadsheet.title}")
    print(f"Spreadsheet ID: {spreadsheet.id}")
    worksheets = spreadsheet.worksheets()
    print(f"Number of sheets: {len(worksheets)}")
    for ws in worksheets:
        print(f"  - Sheet: '{ws.title}' (Rows: {ws.row_count}, Cols: {ws.col_count})")
except gspread.exceptions.SpreadsheetNotFound:
    print("FATAL: Spreadsheet 'Aesthetico' not found.")
    print("Make sure you shared the spreadsheet with:")
    print("  sheet-accessor@aesthetico-inventory.iam.gserviceaccount.com")
    sys.exit(1)
except gspread.exceptions.APIError as e:
    print(f"FATAL: Google Sheets API error: {e}")
    sys.exit(1)

# Step 4: Read data from the 'Sales' sheet
print("\n=== Reading 'Sales' Sheet ===")
try:
    sheet = spreadsheet.worksheet("Sales")
except gspread.exceptions.WorksheetNotFound:
    print("ERROR: Worksheet 'Sales' not found in the spreadsheet.")
    sys.exit(1)
except gspread.exceptions.APIError as e:
    print(f"ERROR: Failed to access Sales sheet: {e}")
    sys.exit(1)

try:
    data = sheet.get_all_records()
except gspread.exceptions.GSpreadException as e:
    print(f"ERROR: Failed to read sheet data: {e}")
    print("This often means duplicate or empty column headers in the sheet.")
    sys.exit(1)

if data:
    df = pd.DataFrame(data)
    print(f"Read {len(df)} rows and {len(df.columns)} columns.")
    print(f"Columns: {list(df.columns)}")
    print("\nFirst 5 rows:")
    print(df.head().to_string())
else:
    print("Sheet is empty or has no data rows.")
