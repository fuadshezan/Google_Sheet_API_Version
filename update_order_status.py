import sys
import gspread
from google.oauth2.service_account import Credentials
from google.auth.exceptions import DefaultCredentialsError
import pandas as pd
from pathao_courier import PathaoCourier, PathaoAuthError
from steadfast_courier import SteadfastCourier

# ── Google Sheets Connection ─────────────────────────────────────────────────

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Platform keywords -> courier type
PATHAO_PLATFORMS = {"pathao inside", "pathao outside", "pathao subcity"}
STEADFAST_PLATFORMS = {"steadfast inside", "steadfast outside", "steadfast subcity"}

# Required columns in the Sales sheet
REQUIRED_COLUMNS = {"Order ID", "Consignment ID", "Delivery Platform", "Order Status"}


def _get_sheet_client():
    """Authenticate and return (spreadsheet, client). Raises on failure."""
    try:
        creds = Credentials.from_service_account_file("credentials.json", scopes=SCOPES)
    except FileNotFoundError:
        raise FileNotFoundError(
            "credentials.json not found. Place it in the same directory as this script."
        )
    except (DefaultCredentialsError, ValueError) as e:
        raise ValueError(f"Invalid credentials.json: {e}")

    try:
        client = gspread.authorize(creds)
    except Exception as e:
        raise ConnectionError(f"Google Sheets authorization failed: {e}")

    try:
        spreadsheet = client.open("Aesthetico")
    except gspread.exceptions.SpreadsheetNotFound:
        raise FileNotFoundError(
            "Spreadsheet 'Aesthetico' not found. "
            "Make sure it is shared with the service account email."
        )
    except gspread.exceptions.APIError as e:
        raise ConnectionError(f"Google Sheets API error: {e}")

    return spreadsheet


def get_sales_sheet():
    """
    Returns the Sales worksheet object and its data as a DataFrame.

    Raises:
        FileNotFoundError: If credentials or spreadsheet not found.
        ConnectionError: If Google Sheets API fails.
        KeyError: If required columns are missing.
    """
    spreadsheet = _get_sheet_client()

    try:
        sheet = spreadsheet.worksheet("Sales")
    except gspread.exceptions.WorksheetNotFound:
        raise KeyError("Worksheet 'Sales' not found in the spreadsheet.")
    except gspread.exceptions.APIError as e:
        raise ConnectionError(f"Failed to access Sales sheet: {e}")

    try:
        data = sheet.get_all_records()
    except gspread.exceptions.GSpreadException as e:
        raise ValueError(
            f"Failed to read Sales sheet data: {e}. "
            "This often means duplicate/empty column headers."
        )

    if not data:
        raise ValueError("Sales sheet is empty or has no data rows.")

    df = pd.DataFrame(data)

    # Validate required columns exist
    missing_cols = REQUIRED_COLUMNS - set(df.columns)
    if missing_cols:
        raise KeyError(
            f"Sales sheet is missing required column(s): {', '.join(missing_cols)}"
        )

    return sheet, df


def get_rows_with_consignment(df):
    """Filter rows that have a Consignment ID."""
    mask = df["Consignment ID"].astype(str).str.strip() != ""
    filtered = df.loc[mask].copy()
    print(f"Found {len(filtered)} row(s) with Consignment ID")
    return filtered


def _detect_platform(delivery_platform):
    """
    Detect courier type from the Delivery Platform value.

    Returns: 'pathao', 'steadfast', or None
    """
    platform = str(delivery_platform).strip().lower()
    if platform in PATHAO_PLATFORMS:
        return "pathao"
    if platform in STEADFAST_PLATFORMS:
        return "steadfast"
    return None


def fetch_statuses(df):
    """
    For each row with a Consignment ID, detect the courier from
    'Delivery Platform' and call the right API.

    Returns a dict: { Order ID : new_status }
    """
    pathao = None
    steadfast = None
    status_map = {}
    errors = []

    for _, row in df.iterrows():
        order_id = row["Order ID"]
        consignment_id = str(row["Consignment ID"]).strip()
        platform = row["Delivery Platform"]
        courier = _detect_platform(platform)

        if courier is None:
            print(f"  {order_id} | {platform} -> Skipped (not Pathao/Steadfast)")
            continue

        if courier == "pathao":
            # Lazy init Pathao client
            if pathao is None:
                try:
                    pathao = PathaoCourier()
                except (EnvironmentError, PathaoAuthError) as e:
                    print(f"  ERROR: Pathao init failed: {e}")
                    print("  Skipping all Pathao orders.")
                    pathao = "FAILED"  # sentinel to skip future attempts
                    errors.append(f"Pathao init: {e}")
                    continue

            if pathao == "FAILED":
                print(f"  {order_id} | Pathao | {consignment_id} -> Skipped (Pathao unavailable)")
                continue

            order_info = pathao.get_order_info(consignment_id)
            if order_info and "order_status" in order_info:
                new_status = order_info["order_status"]
                status_map[order_id] = new_status
                print(f"  {order_id} | Pathao | {consignment_id} -> {new_status}")
            else:
                print(f"  {order_id} | Pathao | {consignment_id} -> Failed to fetch")
                errors.append(f"Pathao fetch failed: {order_id}")

        elif courier == "steadfast":
            # Lazy init Steadfast client
            if steadfast is None:
                try:
                    steadfast = SteadfastCourier()
                except EnvironmentError as e:
                    print(f"  ERROR: Steadfast init failed: {e}")
                    print("  Skipping all Steadfast orders.")
                    steadfast = "FAILED"
                    errors.append(f"Steadfast init: {e}")
                    continue

            if steadfast == "FAILED":
                print(f"  {order_id} | Steadfast | {consignment_id} -> Skipped (Steadfast unavailable)")
                continue

            order_info = steadfast.get_order_by_consignment(consignment_id)
            if order_info and "delivery_status" in order_info:
                new_status = order_info["delivery_status"]
                status_map[order_id] = new_status
                print(f"  {order_id} | Steadfast | {consignment_id} -> {new_status}")
            else:
                print(f"  {order_id} | Steadfast | {consignment_id} -> Failed to fetch")
                errors.append(f"Steadfast fetch failed: {order_id}")

    if errors:
        print(f"\n  Warnings: {len(errors)} order(s) had issues.")

    return status_map


def update_sheet_statuses(sheet, df, status_map):
    """
    Update the 'Order Status' column in the Google Sheet for each Order ID.

    Uses Order ID as the unique key to find the correct row,
    then updates only the Order Status cell.
    """
    if not status_map:
        print("No statuses to update.")
        return

    # Get header row to find column positions dynamically
    try:
        headers = sheet.row_values(1)
    except gspread.exceptions.APIError as e:
        print(f"  ERROR: Could not read sheet headers: {e}")
        return

    try:
        order_id_col = headers.index("Order ID") + 1       # 1-based
        status_col = headers.index("Order Status") + 1      # 1-based
    except ValueError as e:
        print(f"  ERROR: Required column not found in header row: {e}")
        return

    # Build a lookup: Order ID -> sheet row number
    try:
        order_id_values = sheet.col_values(order_id_col)
    except gspread.exceptions.APIError as e:
        print(f"  ERROR: Could not read Order ID column: {e}")
        return

    updates = []
    for order_id, new_status in status_map.items():
        try:
            row_num = order_id_values.index(order_id) + 1  # 1-based
            updates.append(gspread.Cell(row_num, status_col, new_status))
            print(f"  Row {row_num}: {order_id} -> '{new_status}'")
        except ValueError:
            print(f"  WARNING: Order ID '{order_id}' not found in sheet, skipping.")

    if updates:
        try:
            sheet.update_cells(updates)
            print(f"\n  Updated {len(updates)} cell(s) on Google Sheet.")
        except gspread.exceptions.APIError as e:
            print(f"  ERROR: Failed to update cells: {e}")
            print("  This may be a Google API rate limit. Try again in a minute.")
    else:
        print("  No matching rows found to update.")


def run():
    """
    Full pipeline:
      1. Read Sales sheet
      2. Filter rows with Consignment ID
      3. Detect courier (Pathao/Steadfast) and fetch status
      4. Update the Google Sheet
    """
    # Step 1
    print("=== Step 1: Reading Sales Sheet ===")
    try:
        sheet, df = get_sales_sheet()
    except FileNotFoundError as e:
        print(f"  FATAL: {e}")
        return
    except (ConnectionError, KeyError, ValueError) as e:
        print(f"  FATAL: {e}")
        return
    print(f"  {len(df)} rows loaded.\n")

    # Step 2
    print("=== Step 2: Filtering rows with Consignment ID ===")
    df_with_consignment = get_rows_with_consignment(df)
    if df_with_consignment.empty:
        print("  No rows with Consignment ID. Nothing to do.")
        return
    print()

    # Step 3
    print("=== Step 3: Fetching statuses (auto-detect Pathao / Steadfast) ===")
    status_map = fetch_statuses(df_with_consignment)
    print()

    # Step 4
    if status_map:
        print("=== Step 4: Updating Google Sheet ===")
        update_sheet_statuses(sheet, df, status_map)
    else:
        print("=== Step 4: Skipped (no statuses fetched) ===")

    print("\nDone!")


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\nUnexpected error: {type(e).__name__}: {e}")
        sys.exit(1)
