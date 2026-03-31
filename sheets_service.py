import json
import os
import re
from datetime import datetime

import gspread
from google.oauth2.service_account import Credentials
from google.auth.exceptions import DefaultCredentialsError
from get_credential_path import load_credentials

# Regex to extract URL from =IMAGE("url", ...) or =Image("url", ...)
_IMAGE_FORMULA_RE = re.compile(r'=\s*[Ii][Mm][Aa][Gg][Ee]\s*\(\s*"([^"]+)"', re.IGNORECASE)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

SPREADSHEET_NAME = "Aesthetico"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sheets_config.json")

# Default config if a sheet is not listed in sheets_config.json
DEFAULT_CONFIG = {"header_row": 1, "columns": None, "visible": True, "roles": None}

# The sheet that stores user credentials
USER_SHEET_NAME = "UserName"


def _load_config():
    """Load sheet config from sheets_config.json."""
    if not os.path.exists(CONFIG_FILE):
        print(f"  WARNING: {CONFIG_FILE} not found, using defaults for all sheets.")
        return {}
    try:
        with open(CONFIG_FILE, "r") as f:
            config = json.load(f)
        # Remove comment keys
        return {k: v for k, v in config.items() if not k.startswith("_")}
    except (json.JSONDecodeError, OSError) as e:
        print(f"  WARNING: Could not read sheets_config.json: {e}")
        return {}


def _col_letter_to_index(letter):
    """Convert column letter to 0-based index. e.g. 'A'->0, 'F'->5, 'R'->17."""
    result = 0
    for ch in letter.upper():
        result = result * 26 + (ord(ch) - ord("A") + 1)
    return result - 1


def _parse_column_range(col_range):
    """
    Parse a column range string like 'A:F' into (start_index, end_index).
    Both are 0-based. Returns None if input is None (meaning all columns).
    """
    if not col_range:
        return None

    parts = col_range.upper().split(":")
    if len(parts) != 2:
        return None

    start = _col_letter_to_index(parts[0])
    end = _col_letter_to_index(parts[1])
    return (start, end)


class SheetsService:
    """
    Singleton Google Sheets service.
    Initializes the gspread client once and reuses it across requests.
    Uses sheets_config.json for per-sheet header_row and column range.
    """

    def __init__(self):
        # Load sheet config
        self.config = _load_config()

        try:
            # creds = Credentials.from_service_account_file("credentials.json", scopes=SCOPES)
            creds_data = load_credentials()
            creds = Credentials.from_service_account_info(creds_data, scopes=SCOPES)
        except FileNotFoundError:
            raise FileNotFoundError(
                "credentials.json not found. Place it in the same directory as this script."
            )
        except (DefaultCredentialsError, ValueError) as e:
            raise ValueError(f"Invalid credentials.json: {e}")

        try:
            self.client = gspread.authorize(creds)
        except Exception as e:
            raise ConnectionError(f"Google Sheets authorization failed: {e}")

        try:
            self.spreadsheet = self.client.open(SPREADSHEET_NAME)
        except gspread.exceptions.SpreadsheetNotFound:
            raise FileNotFoundError(
                f"Spreadsheet '{SPREADSHEET_NAME}' not found. "
                "Make sure it is shared with the service account email."
            )
        except gspread.exceptions.APIError as e:
            raise ConnectionError(f"Google Sheets API error: {e}")

    def _get_config(self, sheet_name):
        """Get config for a sheet, with defaults."""
        cfg = self.config.get(sheet_name, DEFAULT_CONFIG)
        return {
            "header_row": cfg.get("header_row", 1),
            "columns": cfg.get("columns", None),
            "visible": cfg.get("visible", True),
            "roles": cfg.get("roles", None),  # None means all roles
            "role_columns": cfg.get("role_columns", None),  # {role: [col_names]}
            "image_columns": cfg.get("image_columns", []),  # ["Product Image"]
        }

    def get_sheet_names(self):
        """Return a list of all worksheet names."""
        try:
            worksheets = self.spreadsheet.worksheets()
            return [ws.title for ws in worksheets]
        except gspread.exceptions.APIError as e:
            raise ConnectionError(f"Failed to list sheets: {e}")

    def get_sheet_data(self, sheet_name):
        """
        Return sheet data as { headers: [...], rows: [[...], ...], config: {...},
                                image_columns: [...] }.

        Reads header from the row specified in sheets_config.json (default: row 1).
        Only returns columns within the configured range (default: all).
        Data rows start from header_row + 1.
        For columns listed in image_columns config, extracts URLs from =IMAGE() formulas.
        """
        cfg = self._get_config(sheet_name)
        header_row = cfg["header_row"]
        col_range = _parse_column_range(cfg["columns"])
        image_col_names = cfg.get("image_columns", [])

        try:
            worksheet = self.spreadsheet.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            raise KeyError(f"Worksheet '{sheet_name}' not found.")
        except gspread.exceptions.APIError as e:
            raise ConnectionError(f"Failed to access sheet '{sheet_name}': {e}")

        try:
            all_values = worksheet.get_all_values()
        except gspread.exceptions.APIError as e:
            raise ConnectionError(f"Failed to read sheet '{sheet_name}': {e}")

        if not all_values:
            return {"headers": [], "rows": [], "config": cfg, "image_columns": []}

        # Extract header row (1-based to 0-based)
        if header_row > len(all_values):
            return {"headers": [], "rows": [], "config": cfg, "image_columns": []}

        header_row_data = all_values[header_row - 1]
        data_rows = all_values[header_row:]  # Everything after header row

        # Apply column range filter
        if col_range:
            start, end = col_range
            headers = header_row_data[start: end + 1]
            rows = [row[start: end + 1] for row in data_rows]
        else:
            headers = header_row_data
            rows = data_rows

        # Filter out completely empty rows
        rows = [row for row in rows if any(str(cell).strip() for cell in row)]

        # ── Extract image URLs from formulas ──────────────────────────────
        if image_col_names:
            # Find which column indices (in the filtered headers) are image columns
            img_indices = []
            for col_name in image_col_names:
                for i, h in enumerate(headers):
                    if h.strip() == col_name.strip():
                        img_indices.append(i)
                        break

            if img_indices:
                # Read formulas from the sheet (second API call)
                try:
                    all_formulas = worksheet.get_all_values(
                        value_render_option="FORMULA"
                    )
                    formula_header = all_formulas[header_row - 1] if header_row <= len(all_formulas) else []
                    formula_rows = all_formulas[header_row:] if header_row <= len(all_formulas) else []

                    # Apply same column range filter to formulas
                    if col_range:
                        formula_rows = [row[start: end + 1] for row in formula_rows]

                    # Filter empty rows in sync — rebuild using same non-empty logic
                    # We need to map original row indices to filtered ones
                    raw_data_rows = all_values[header_row:]
                    if col_range:
                        raw_filtered = [row[start: end + 1] for row in raw_data_rows]
                    else:
                        raw_filtered = raw_data_rows

                    # Build formula lookup: only for non-empty rows
                    formula_for_rows = []
                    for ri, raw_row in enumerate(raw_filtered):
                        if any(str(cell).strip() for cell in raw_row):
                            if ri < len(formula_rows):
                                formula_for_rows.append(formula_rows[ri])
                            else:
                                formula_for_rows.append([])

                    # Now replace image column values with extracted URLs
                    for row_idx, row in enumerate(rows):
                        for col_idx in img_indices:
                            if row_idx < len(formula_for_rows):
                                f_row = formula_for_rows[row_idx]
                                formula_val = f_row[col_idx] if col_idx < len(f_row) else ""
                                match = _IMAGE_FORMULA_RE.search(str(formula_val))
                                if match:
                                    row[col_idx] = match.group(1)  # Replace with URL
                                # If no match, keep original value (could be empty or plain text)

                except gspread.exceptions.APIError as e:
                    print(f"  WARNING: Could not read formulas for image columns: {e}")

        return {
            "headers": headers,
            "rows": rows,
            "config": cfg,
            "image_columns": image_col_names,
        }

    def get_sheet_config(self):
        """Return the full sheet config dict (for API exposure)."""
        return self.config

    def get_worksheet(self, sheet_name):
        """Return the raw gspread worksheet object."""
        try:
            return self.spreadsheet.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            raise KeyError(f"Worksheet '{sheet_name}' not found.")
        except gspread.exceptions.APIError as e:
            raise ConnectionError(f"Failed to access sheet '{sheet_name}': {e}")

    # ── Authentication Methods ────────────────────────────────────────────

    def validate_user(self, email, password):
        """
        Validate user credentials against the UserName sheet.
        Returns user dict {username, email, role} on success, None on failure.
        """
        try:
            data = self.get_sheet_data(USER_SHEET_NAME)
        except (KeyError, ConnectionError) as e:
            print(f"  ERROR: Cannot read UserName sheet: {e}")
            return None

        headers = [h.lower().strip() for h in data["headers"]]

        # Find column indices
        try:
            email_idx = headers.index("email")
            pass_idx = headers.index("password")
            user_idx = headers.index("username")
            role_idx = headers.index("role")
        except ValueError:
            print("  ERROR: UserName sheet missing required columns (email, password, username, role)")
            return None

        for row in data["rows"]:
            row_email = row[email_idx].strip() if email_idx < len(row) else ""
            row_pass = row[pass_idx].strip() if pass_idx < len(row) else ""

            if row_email.lower() == email.lower() and row_pass == password:
                username = row[user_idx].strip() if user_idx < len(row) else ""
                role = row[role_idx].strip().lower() if role_idx < len(row) else "moderator"
                return {
                    "username": username,
                    "email": row_email,
                    "role": role,
                }

        return None

    def update_last_active(self, email):
        """Update the lastActive column for a user in the UserName sheet."""
        try:
            worksheet = self.get_worksheet(USER_SHEET_NAME)
            data = worksheet.get_all_values()
            if not data:
                return

            headers = [h.lower().strip() for h in data[0]]
            try:
                email_idx = headers.index("email")
                active_idx = headers.index("lastactive")
            except ValueError:
                return  # Column not found, skip silently

            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            for i, row in enumerate(data[1:], start=2):  # Skip header, 1-based row
                row_email = row[email_idx].strip() if email_idx < len(row) else ""
                if row_email.lower() == email.lower():
                    worksheet.update_cell(i, active_idx + 1, now)  # 1-based column
                    return
        except Exception as e:
            print(f"  WARNING: Could not update lastActive: {e}")

    def get_sheets_for_role(self, role):
        """
        Return list of sheet names that are visible and accessible for a given role.
        Admin gets all visible sheets. Other roles get filtered by 'roles' config.
        """
        all_names = self.get_sheet_names()
        accessible = []

        for name in all_names:
            cfg = self._get_config(name)

            # Skip hidden sheets
            if not cfg.get("visible", True):
                continue

            # Check role access
            allowed_roles = cfg.get("roles")
            if allowed_roles is None:
                # No restriction - all roles can access
                accessible.append(name)
            elif role in [r.lower() for r in allowed_roles]:
                accessible.append(name)

        return accessible

    def can_access_sheet(self, sheet_name, role):
        """Check if a given role can access a specific sheet."""
        cfg = self._get_config(sheet_name)

        if not cfg.get("visible", True):
            return role == "admin"  # Admin can still access hidden sheets via direct API

        allowed_roles = cfg.get("roles")
        if allowed_roles is None:
            return True

        return role in [r.lower() for r in allowed_roles]

    def filter_columns_for_role(self, sheet_name, role, headers, rows):
        """
        Filter headers and rows to only include columns allowed for the role.

        If role_columns is defined for this sheet and this role, only those
        column names are returned. Admin always sees all columns.
        If the role is not listed in role_columns, all columns are returned.

        Returns: (filtered_headers, filtered_rows)
        """
        # Admin always sees everything
        if role == "admin":
            return headers, rows

        cfg = self._get_config(sheet_name)
        role_columns = cfg.get("role_columns")

        # No role_columns config -> return all columns
        if not role_columns:
            return headers, rows

        # Get allowed column names for this role
        allowed_cols = role_columns.get(role)

        # Role not listed in role_columns -> return all columns
        if allowed_cols is None:
            return headers, rows

        # Find indices of allowed columns (match by header name)
        allowed_indices = []
        for col_name in allowed_cols:
            for i, h in enumerate(headers):
                if h.strip() == col_name.strip():
                    allowed_indices.append(i)
                    break

        # Filter headers and rows by allowed indices
        filtered_headers = [headers[i] for i in allowed_indices]
        filtered_rows = [
            [row[i] if i < len(row) else "" for i in allowed_indices]
            for row in rows
        ]

        return filtered_headers, filtered_rows
