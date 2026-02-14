import os
import sys
from contextlib import asynccontextmanager
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from sheets_service import SheetsService
from auth_service import create_access_token, verify_access_token

# ── Globals ──────────────────────────────────────────────────────────────────

sheets: SheetsService = None  # Initialized at startup


# ── Pydantic Models ──────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
    email: str
    role: str


# ── Auth Dependency ──────────────────────────────────────────────────────────

async def get_current_user(request: Request) -> dict:
    """
    Extract and verify JWT from Authorization header.
    Returns user payload dict: {username, email, role, exp}.
    Raises 401 if token is missing or invalid.
    """
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")

    token = auth_header.replace("Bearer ", "")
    payload = verify_access_token(token)

    if payload is None:
        raise HTTPException(status_code=401, detail="Token expired or invalid. Please log in again.")

    return payload


async def get_optional_user(request: Request) -> Optional[dict]:
    """
    Same as get_current_user but returns None instead of raising 401.
    Used for endpoints that work differently when authenticated vs not.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.replace("Bearer ", "")
    return verify_access_token(token)


# ── Lifespan (startup / shutdown) ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the Google Sheets client once when the server starts."""
    global sheets
    try:
        sheets = SheetsService()
        print("Google Sheets service initialized.")
    except (FileNotFoundError, ValueError, ConnectionError) as e:
        print(f"FATAL: Could not initialize Google Sheets: {e}")
        sys.exit(1)
    yield
    print("Server shutting down.")


# ── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Aesthetico Dashboard",
    description="Google Sheets viewer + Courier status updater",
    lifespan=lifespan,
)

# CORS — allow frontend JS to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (CSS, JS, images)
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
async def index():
    """Serve the main frontend page (login or dashboard based on JS auth check)."""
    return FileResponse(os.path.join(static_dir, "index.html"))


@app.get("/login")
async def login_page():
    """Serve the login page."""
    return FileResponse(os.path.join(static_dir, "login.html"))


# ── Auth Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """
    Authenticate user against the UserName sheet.
    Returns a JWT token on success.
    """
    user = sheets.validate_user(req.email, req.password)

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    # Create JWT token
    token = create_access_token({
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
    })

    # Update lastActive in background (non-blocking, best-effort)
    try:
        sheets.update_last_active(user["email"])
    except Exception as e:
        print(f"  WARNING: Could not update lastActive: {e}")

    return LoginResponse(
        token=token,
        username=user["username"],
        email=user["email"],
        role=user["role"],
    )


@app.get("/api/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the current user's info from the JWT token."""
    return {
        "username": user.get("username"),
        "email": user.get("email"),
        "role": user.get("role"),
    }


# ── Sheet Endpoints (Protected) ─────────────────────────────────────────────

@app.get("/api/sheets")
async def list_sheets(user: dict = Depends(get_current_user)):
    """Return a list of sheet names the user's role can access."""
    try:
        role = user.get("role", "moderator")
        accessible_names = sheets.get_sheets_for_role(role)
        config = sheets.get_sheet_config()

        sheet_list = []
        for name in accessible_names:
            cfg = config.get(name, {"header_row": 1, "columns": None})
            sheet_list.append({
                "name": name,
                "header_row": cfg.get("header_row", 1),
                "columns": cfg.get("columns"),
            })
        return {"sheets": sheet_list}
    except ConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/config")
async def get_config(user: dict = Depends(get_current_user)):
    """Return the full sheets config (admin only)."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return sheets.get_sheet_config()


@app.get("/api/sheets/{sheet_name}")
async def get_sheet(sheet_name: str, user: dict = Depends(get_current_user)):
    """Return all data from a specific sheet (if user has access)."""
    role = user.get("role", "moderator")

    if not sheets.can_access_sheet(sheet_name, role):
        raise HTTPException(status_code=403, detail=f"You don't have access to '{sheet_name}'.")

    try:
        data = sheets.get_sheet_data(sheet_name)

        # Apply role-based column filtering
        filtered_headers, filtered_rows = sheets.filter_columns_for_role(
            sheet_name, role, data["headers"], data["rows"]
        )
        data["headers"] = filtered_headers
        data["rows"] = filtered_rows

        return data
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/update-statuses")
async def update_statuses(user: dict = Depends(get_current_user)):
    """
    Trigger the order status update pipeline (admin only).
    1. Read Sales sheet
    2. Filter rows with Consignment ID
    3. Fetch statuses from Pathao / Steadfast
    4. Update the Google Sheet
    """
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required to update statuses.")

    # Import the existing functions from update_order_status.py
    from update_order_status import (
        get_rows_with_consignment,
        fetch_statuses,
        _detect_platform,
    )
    import gspread

    results = {
        "total_rows": 0,
        "with_consignment": 0,
        "updated": 0,
        "details": [],
        "errors": [],
    }

    # Step 1: Read Sales sheet
    try:
        sheet_data = sheets.get_sheet_data("Sales")
        worksheet = sheets.get_worksheet("Sales")
    except (KeyError, ConnectionError) as e:
        raise HTTPException(status_code=502, detail=f"Could not read Sales sheet: {e}")

    if not sheet_data["rows"]:
        return results

    df = pd.DataFrame(sheet_data["rows"], columns=sheet_data["headers"])
    results["total_rows"] = len(df)

    # Step 2: Filter rows with Consignment ID
    df_with_consignment = get_rows_with_consignment(df)
    results["with_consignment"] = len(df_with_consignment)

    if df_with_consignment.empty:
        return results

    # Step 3: Fetch statuses
    status_map = fetch_statuses(df_with_consignment)

    # Step 4: Update Google Sheet
    if status_map:
        try:
            # Use the config-aware header row for Sales
            sales_header_row = sheet_data.get("config", {}).get("header_row", 1)
            headers = worksheet.row_values(sales_header_row)
            order_id_col = headers.index("Order ID") + 1
            status_col = headers.index("Order Status") + 1
            order_id_values = worksheet.col_values(order_id_col)

            updates = []
            for order_id, new_status in status_map.items():
                try:
                    row_num = order_id_values.index(order_id) + 1
                    updates.append(gspread.Cell(row_num, status_col, new_status))
                    results["details"].append({
                        "order_id": order_id,
                        "status": new_status,
                        "row": row_num,
                    })
                except ValueError:
                    results["errors"].append(f"Order ID '{order_id}' not found in sheet")

            if updates:
                worksheet.update_cells(updates)
                results["updated"] = len(updates)

        except gspread.exceptions.APIError as e:
            results["errors"].append(f"Google Sheets update failed: {e}")
        except ValueError as e:
            results["errors"].append(f"Column not found: {e}")

    return results


# ── Run Server ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
